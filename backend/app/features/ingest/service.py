"""Bulk upload batches for their owner: making one, and reading batches and their designs
(docs/adr/0006-bulk-pipeline.md, "Endpoints for batches"). uploads.py signs and confirms the
designs' uploads; lifecycle.py submits, retries and cancels.

A batch is made all at once or not at all: every design checked, its manifest row found, its SKU
free, and the batch within its owner's plan, before anything is made or held.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import storage_keys as keys
from app.features.billing.plans import GB, PLAN_LABELS, BatchLimits, PlanTier, get_batch_limits, normalize_tier
from app.features.billing.quota_service import get_or_create_billing
from app.features.ingest.designs import Design, known_category, name_problem, plan_designs, sku_problems
from app.features.ingest.items import lock_owner_batches
from app.features.ingest.progress import DesignRenders, batch_job_credits, design_renders
from app.features.ingest.render_plans import checked_plan, plan_render
from app.features.render_jobs import idempotency
from app.features.scene.skus import sku_holders
from app.models import IngestBatch, IngestItem, User
from app.models.ingest import OPEN_BATCH_STATUSES
from app.schemas.ingest import (
    IngestBatchCreate,
    IngestBatchCreated,
    IngestBatchOut,
    IngestBatchPage,
    IngestCompanionOut,
    IngestCredits,
    IngestItemIn,
    IngestItemOut,
    IngestItemPage,
    IngestPlannedJob,
    IngestProblem,
    IngestRenderPlanQuote,
    IngestSkuCheckOut,
)


def owner_tier(db: Session, user: User) -> PlanTier:
    return normalize_tier(get_or_create_billing(db, user).plan_tier)


def assert_batch_fits_plan(tier: PlanTier, designs: int, total_bytes: int) -> None:
    """402 unless the owner's plan has bulk upload and the batch is within its limits."""
    limits, plan = get_batch_limits(tier), PLAN_LABELS[tier]
    if limits.max_designs == 0:
        raise HTTPException(status_code=402, detail=f"Bulk upload is part of Grow and Studio, not {plan}.")
    if designs > limits.max_designs:
        detail = f"A {plan} batch holds at most {limits.max_designs} designs; this one has {designs}."
        raise HTTPException(status_code=402, detail=detail)
    if total_bytes > limits.max_bytes:
        detail = f"A {plan} batch holds at most {limits.max_bytes / GB:g} GB of files; this one has {total_bytes / GB:.2f} GB."
        raise HTTPException(status_code=402, detail=detail)


def assert_open_batch_room(db: Session, user_id: int, limits: BatchLimits) -> None:
    """429 when the owner has as many batches open (a draft, or processing) as they may."""
    open_batches = db.execute(
        select(func.count())
        .select_from(IngestBatch)
        .where(IngestBatch.user_id == user_id, IngestBatch.status.in_(OPEN_BATCH_STATUSES))
    ).scalar_one()
    if open_batches >= limits.max_open_batches:
        detail = f"At most {limits.max_open_batches} batches can be open at once: finish or cancel one first."
        raise HTTPException(status_code=429, detail=detail)


def owned_batch(db: Session, user: User, batch_id: int) -> IngestBatch:
    """The caller's batch, as stored now; 404 for any other."""
    batch = db.execute(
        select(IngestBatch).where(IngestBatch.id == batch_id).execution_options(populate_existing=True)
    ).scalars().first()
    if batch is None or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


def _declared_bytes(item: IngestItemIn) -> int:
    return item.bytes + sum(companion.bytes for companion in item.companions)


def _problems_found(problems: list[IngestProblem]) -> HTTPException:
    """422 with every problem: the batch's own first, then by item and row."""
    ordered = sorted(problems, key=lambda problem: (problem.item is not None, problem.item or 0, problem.row or 0))
    count = f"{len(problems)} problem{'s' if len(problems) > 1 else ''}"
    detail = {"message": f"The batch has {count}; nothing was made.", "problems": [p.model_dump() for p in ordered]}
    return HTTPException(status_code=422, detail=detail)


def _earlier_batch(db: Session, user_id: int, key: str | None, body_hash: str | None) -> IngestBatch | None:
    """The batch an earlier request with this Idempotency-Key made; 409 when its body differed."""
    if key is None:
        return None
    batch = db.execute(
        select(IngestBatch).where(IngestBatch.user_id == user_id, IngestBatch.idempotency_key == key)
    ).scalars().first()
    if batch is not None and batch.request_hash != body_hash:
        raise HTTPException(status_code=409, detail="Idempotency-Key was already used for another request")
    return batch


def _add_batch(db: Session, user: User, body: IngestBatchCreate, designs: list[Design], **fields) -> IngestBatch:
    """The batch and its designs, each awaiting its upload, its files' keys under its own id.
    Flushed, not committed."""
    now = datetime.utcnow()
    batch = IngestBatch(
        user_id=user.id,
        status="draft",
        source="studio",
        options={"decimate": body.options.decimate, "default_category": known_category(body.options.default_category)},
        item_count=len(designs),
        total_bytes=sum(design.source.bytes + sum(file.bytes for file in design.companions) for design in designs),
        created_at=now,
        updated_at=now,
        **fields,
    )
    db.add(batch)
    db.flush()
    items = [
        IngestItem(
            batch_id=batch.id,
            user_id=user.id,
            position=design.position,
            filename=design.source.filename,
            source_key="",
            source_bytes=design.source.bytes,
            companions=[],
            sku=design.sku,
            name=design.name,
            category=design.category,
            note=design.note,
            units=design.units,
            status="awaiting_upload",
            attempts=0,
            model_credit_held=0,
            render_credits_held=0,
            warnings=[],
            created_at=now,
            updated_at=now,
        )
        for design in designs
    ]
    db.add_all(items)
    db.flush()
    for item, design in zip(items, designs, strict=True):
        item.source_key = keys.ingest_source_key(user.id, batch.id, item.id, design.source.filename)
        item.companions = [
            {
                "filename": file.filename,
                "key": keys.ingest_companion_key(user.id, batch.id, item.id, number, file.filename),
                "bytes": file.bytes,
            }
            for number, file in enumerate(design.companions)
        ]
    db.flush()
    return batch


def create_batch(
    db: Session, user: User, body: IngestBatchCreate, idempotency_key: str | None = None
) -> tuple[IngestBatch, bool]:
    """Make a draft batch of the request's designs, each awaiting its upload, and say whether it
    is new: the same Idempotency-Key and body answer the batch they made, another body is 409.

    Nothing is made when the owner's plan has no bulk upload or the batch passes its limits
    (402), the render plan isn't one (400) or renders larger than the plan does (402), any design,
    manifest row or SKU has a problem (422, every one of them), or the owner has as many batches
    open as they may (429).
    """
    idempotency.check_key(idempotency_key)
    body_hash = idempotency.request_hash(body) if idempotency_key is not None else None
    if earlier := _earlier_batch(db, user.id, idempotency_key, body_hash):
        return earlier, False
    tier = owner_tier(db, user)
    limits = get_batch_limits(tier)
    assert_batch_fits_plan(tier, len(body.items), sum(_declared_bytes(item) for item in body.items))
    render_plan, render_credits = (None, 0) if body.render_plan is None else plan_render(db, user, body.render_plan)
    designs, problems = plan_designs(body.items, body.manifest, body.options.default_category, limits)
    if reason := ("A batch needs a name." if not body.name.strip() else name_problem(body.name.strip())):
        problems.append(IngestProblem(field="name", code="name_invalid", message=reason))
    problems += sku_problems(db, designs)
    if problems:
        raise _problems_found(problems)

    lock_owner_batches(db, user.id)
    if earlier := _earlier_batch(db, user.id, idempotency_key, body_hash):  # made meanwhile
        db.commit()
        return earlier, False
    assert_open_batch_room(db, user.id, limits)
    try:
        batch = _add_batch(
            db, user, body, designs,
            name=body.name.strip(),
            render_plan=render_plan,
            render_credits_per_design=render_credits,
            idempotency_key=idempotency_key,
            request_hash=body_hash,
        )
        db.commit()
    except IntegrityError:
        # Another owner's batch reserved one of these SKUs after the check.
        db.rollback()
        if problems := sku_problems(db, designs):
            raise _problems_found(problems) from None
        raise
    db.refresh(batch)
    return batch, True


def check_skus(db: Session, skus: list[str]) -> IngestSkuCheckOut:
    """Which SKUs a scene holds, and which a design in progress reserves."""
    holders = sku_holders(db, [sku.strip() for sku in skus])
    return IngestSkuCheckOut(
        taken=sorted(sku for sku, holder in holders.items() if holder == "taken"),
        reserved=sorted(sku for sku, holder in holders.items() if holder == "reserved"),
    )


def item_view(item: IngestItem, renders: DesignRenders | None = None) -> IngestItemOut:
    """A design as the API answers it; with its render jobs and thumbnail when they were read."""
    renders = renders or DesignRenders()
    return IngestItemOut(
        id=item.id,
        batch_id=item.batch_id,
        position=item.position,
        filename=item.filename,
        bytes=item.source_bytes,
        companions=[IngestCompanionOut(filename=file["filename"], bytes=file["bytes"]) for file in item.companions],
        sku=item.sku,
        name=item.name,
        category=item.category,
        note=item.note,
        units=item.units,
        status=item.status,
        error=item.error,
        error_code=item.error_code,
        attempts=item.attempts,
        scene_id=item.scene_id,
        convert_job_id=item.convert_job_id,
        model_credit_held=item.model_credit_held,
        render_credits_held=item.render_credits_held,
        polygon_count=item.polygon_count,
        size_mm=item.size_mm,
        warnings=item.warnings or [],
        embed_url=item.embed_url,
        thumbnail_url=renders.thumbnail_url,
        jobs=renders.jobs,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def item_views(db: Session, items: list[IngestItem]) -> list[IngestItemOut]:
    """Designs with their render jobs and thumbnails, read together."""
    renders = design_renders(db, items)
    return [item_view(item, renders[item.id]) for item in items]


def batch_views(db: Session, batches: list[IngestBatch]) -> list[IngestBatchOut]:
    """Batches with their designs counted by status, and their credits held, charged and given
    back, by their designs and their jobs, in three queries."""
    counts: dict[int, dict[str, int]] = defaultdict(dict)
    # Held by the designs (model, render), and given back to them (model, render).
    designs: dict[int, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    if batches:
        rows = db.execute(
            select(
                IngestItem.batch_id,
                IngestItem.status,
                func.count(),
                func.sum(IngestItem.model_credit_held),
                func.sum(IngestItem.render_credits_held),
                func.sum(IngestItem.model_credits_refunded),
                func.sum(IngestItem.render_credits_refunded),
            )
            .where(IngestItem.batch_id.in_([batch.id for batch in batches]))
            .group_by(IngestItem.batch_id, IngestItem.status)
        ).all()
        for batch_id, status, count, *sums in rows:
            counts[batch_id][status] = count
            designs[batch_id] = [total + (part or 0) for total, part in zip(designs[batch_id], sums, strict=True)]
    jobs = batch_job_credits(db, [batch.id for batch in batches])
    return [
        IngestBatchOut(
            id=batch.id,
            name=batch.name,
            status=batch.status,
            source=batch.source,
            item_count=batch.item_count,
            total_bytes=batch.total_bytes,
            counts=counts[batch.id],
            render_plan=batch.render_plan,
            options=batch.options,
            quote=IngestCredits(
                model_credits=batch.item_count, render_credits=batch.item_count * batch.render_credits_per_design
            ),
            held=IngestCredits(
                model_credits=designs[batch.id][0], render_credits=designs[batch.id][1] + jobs[batch.id].held
            ),
            charged=IngestCredits(model_credits=jobs[batch.id].scenes_made, render_credits=jobs[batch.id].charged),
            refunded=IngestCredits(
                model_credits=designs[batch.id][2], render_credits=designs[batch.id][3] + jobs[batch.id].refunded
            ),
            created_at=batch.created_at,
            updated_at=batch.updated_at,
            submitted_at=batch.submitted_at,
            finished_at=batch.finished_at,
            expires_at=batch.expires_at,
        )
        for batch in batches
    ]


def batch_view(db: Session, batch: IngestBatch) -> IngestBatchOut:
    return batch_views(db, [batch])[0]


def created_view(db: Session, batch: IngestBatch) -> IngestBatchCreated:
    """A new batch with every one of its designs, so the uploads can start."""
    items = db.execute(select(IngestItem).where(IngestItem.batch_id == batch.id).order_by(IngestItem.position)).scalars()
    return IngestBatchCreated(**batch_view(db, batch).model_dump(), items=[item_view(item) for item in items])


def list_batches(db: Session, user: User, page: int, limit: int) -> IngestBatchPage:
    """The caller's batches, newest first."""
    total = db.execute(select(func.count()).select_from(IngestBatch).where(IngestBatch.user_id == user.id)).scalar_one()
    batches = list(
        db.execute(
            select(IngestBatch)
            .where(IngestBatch.user_id == user.id)
            .order_by(IngestBatch.created_at.desc(), IngestBatch.id.desc())
            .limit(limit)
            .offset((page - 1) * limit)
        ).scalars()
    )
    return IngestBatchPage(items=batch_views(db, batches), total=total, page=page, limit=limit)


def list_items(db: Session, user: User, batch_id: int, status: str | None, page: int, limit: int) -> IngestItemPage:
    """One page of a batch's designs, in the order they were dropped, of one status if asked."""
    batch = owned_batch(db, user, batch_id)
    conditions = [IngestItem.batch_id == batch.id]
    if status is not None:
        conditions.append(IngestItem.status == status)
    total = db.execute(select(func.count()).select_from(IngestItem).where(*conditions)).scalar_one()
    items = db.execute(
        select(IngestItem).where(*conditions).order_by(IngestItem.position).limit(limit).offset((page - 1) * limit)
    ).scalars()
    return IngestItemPage(items=item_views(db, list(items)), total=total, page=page, limit=limit)


def quote_render_plan(db: Session, user: User, raw: dict) -> IngestRenderPlanQuote:
    """What a render plan costs each design, before any batch is made: 400 and 402 as making a
    batch with it would answer."""
    _, renders = checked_plan(db, user, raw)
    return IngestRenderPlanQuote(
        render_credits=sum(planned.credits for planned in renders),
        jobs=[IngestPlannedJob(kind=planned.kind, credits=planned.credits, files=planned.files) for planned in renders],
    )
