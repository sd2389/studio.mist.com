"""A batch after it is made: submitting it (its credits held, its uploaded designs converting),
retrying designs that failed, and canceling what hasn't finished, refunded
(docs/adr/0006-bulk-pipeline.md, "Credits for a batch" and "The batch page").

Each change is one transaction under the owner's lock. Credits are held for a batch's designs
together, with one conditional UPDATE (402 naming the shortfall); each design keeps what it
holds until its jobs take it, and gets back once what it still holds when it fails or is
canceled.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.features.billing.credit_pools import split_bought
from app.features.billing.plans import get_batch_limits
from app.features.billing.quota_service import hold_batch_credits, refund_render_job
from app.features.ingest.conversions import queue_conversions
from app.features.render_jobs.archive_spec import ARCHIVE_KIND
from app.features.ingest.items import RETENTION_DAYS, lock_owner_batches, locked_items, release_held_credits
from app.features.ingest.render_plans import checked_plan
from app.features.ingest.renders import queue_design_renders, renders_to_run
from app.features.ingest.retention import sources_gone
from app.features.ingest.service import assert_batch_fits_plan, assert_open_batch_room, owned_batch, owner_tier
from app.features.scene.skus import SKU_RESERVED, SKU_TAKEN, sku_holders
from app.models import IngestBatch, IngestItem, RenderJob, Scene, User
from app.models.ingest import OPEN_BATCH_STATUSES, UNFINISHED_ITEM_STATUSES
from app.schemas.ingest import IngestRefusal

SOURCE_DELETED = "its CAD file is kept 30 days after the batch finishes and has gone; upload it in a new batch."
# A design to hold credits for: (the design, its model credits, its render credits).
DesignHold = tuple[IngestItem, int, int]


def _hold_credits(db: Session, user_id: int, holds: list[DesignHold], now: datetime) -> None:
    """Hold what each design needs, all together (402 when short), each design keeping its own
    with its share of the bought credits the hold took. Not committed."""
    model_credits = [model for _, model, _ in holds]
    render_credits = [render for _, _, render in holds]
    hold = hold_batch_credits(db, user_id, sum(model_credits), sum(render_credits))
    bought_model = split_bought(model_credits, hold.bought_model_credits)
    bought_render = split_bought(render_credits, hold.bought_render_credits)
    for (item, model, render), model_bought, render_bought in zip(holds, bought_model, bought_render, strict=True):
        item.model_credit_held = model
        item.bought_model_credit_held = model_bought
        item.render_credits_held = render
        item.bought_render_credits_held = render_bought
        item.credits_period_start = hold.period_start
        item.credits_allowance_generation = hold.allowance_generation
        item.updated_at = now


def _assert_plan_renders(db: Session, user: User, batch: IngestBatch) -> None:
    """402 when the owner's plan no longer renders the batch's render plan (its caps changed)."""
    if batch.render_plan is not None:
        checked_plan(db, user, batch.render_plan)


def submit_batch(db: Session, user: User, batch_id: int) -> IngestBatch:
    """Hold every design's credits, a model credit and its render plan's price each, and start
    converting the uploaded ones; the others start when their uploads are confirmed. 402, and
    nothing held, when the owner's plan no longer takes the batch or its plan, or the credits are
    short. A batch submitted already is answered as it is; a canceled one is 409."""
    lock_owner_batches(db, user.id)
    batch = owned_batch(db, user, batch_id)
    if batch.status == "canceled":
        raise HTTPException(status_code=409, detail="Batch is canceled")
    if batch.status != "draft":
        db.commit()
        return batch
    tier = owner_tier(db, user)
    assert_batch_fits_plan(tier, batch.item_count, batch.total_bytes)
    _assert_plan_renders(db, user, batch)
    items = locked_items(db, IngestItem.batch_id == batch.id)
    now = datetime.utcnow()
    _hold_credits(db, user.id, [(item, 1, batch.render_credits_per_design) for item in items], now)
    batch.status = "processing"
    batch.submitted_at = now
    batch.updated_at = now
    queue_conversions(db, batch, [item for item in items if item.status == "uploaded"], tier, now)
    db.commit()
    db.refresh(batch)
    return batch


def _refusals(
    db: Session, batch: IngestBatch, items: list[IngestItem], asked: bool
) -> tuple[list[IngestItem], list[IngestRefusal]]:
    """The designs that can run again, and why the others can't: not failed (when asked for by
    id), or, for one to convert again, its CAD file deleted (or due to be) 30 days after the
    batch finished, or its SKU since taken by a scene or reserved by another design. One whose
    scene was made renders again, under the SKU its scene holds."""
    refused = [
        IngestRefusal(item_id=item.id, code="not_failed", message=f"Item {item.id} is {item.status}, not failed.")
        for item in items
        if asked and item.status != "failed"
    ]
    failed = [item for item in items if item.status == "failed"]
    converting = [item for item in failed if item.scene_id is None]
    blocked = set()
    if converting and sources_gone(batch):
        for item in converting:
            refused.append(IngestRefusal(item_id=item.id, code="source_deleted", message=f"{item.sku}: {SOURCE_DELETED}"))
            blocked.add(item.id)
        converting = []
    holders = sku_holders(db, [item.sku for item in converting], except_item_ids=[item.id for item in converting])
    for item in converting:
        if holder := holders.get(item.sku):
            message = SKU_TAKEN if holder == "taken" else SKU_RESERVED
            refused.append(IngestRefusal(item_id=item.id, code=f"sku_{holder}", message=f"{item.sku}: {message}."))
            blocked.add(item.id)
    return [item for item in failed if item.id not in blocked], refused


def _retry_holds(db: Session, batch: IngestBatch, retry: list[IngestItem]) -> list[DesignHold]:
    """What each design retried holds again: one converting again, a model credit and its plan's
    price; one rendering again, the price of the parts of its plan that didn't complete."""
    return [
        (item, 1, batch.render_credits_per_design)
        if item.scene_id is None
        else (item, 0, sum(planned.credits for planned in renders_to_run(db, batch, item.id)))
        for item in retry
    ]


def retry_items(
    db: Session, user: User, batch_id: int, item_ids: list[int] | None = None
) -> tuple[IngestBatch, list[int], list[IngestRefusal]]:
    """Run failed designs again from the stage they failed in, all of them or those named,
    holding their credits again (402 when short): a failed conversion converts again from the
    uploaded files; a failed render renders again only the jobs that didn't complete. A design
    whose SKU was taken before its scene was made is refused and stays failed. A batch that had
    finished opens again, if the owner may have another open (429). 409 for a batch not yet
    submitted, or canceled."""
    lock_owner_batches(db, user.id)
    batch = owned_batch(db, user, batch_id)
    if batch.status not in ("processing", "completed_with_errors"):
        raise HTTPException(status_code=409, detail=f"Batch is {batch.status}; only a submitted batch's designs retry")
    conditions = [IngestItem.batch_id == batch.id]
    if item_ids is not None:
        conditions.append(IngestItem.id.in_(item_ids))
    items = locked_items(db, *conditions)
    if item_ids is not None and (unknown := set(item_ids) - {item.id for item in items}):
        raise HTTPException(status_code=404, detail=f"Item {min(unknown)} not found")
    retry, refused = _refusals(db, batch, items, asked=item_ids is not None)
    if not retry:
        db.commit()
        return batch, [], refused
    tier = owner_tier(db, user)
    assert_batch_fits_plan(tier, batch.item_count, batch.total_bytes)
    _assert_plan_renders(db, user, batch)
    if batch.status != "processing":
        assert_open_batch_room(db, user.id, get_batch_limits(tier))
    now = datetime.utcnow()
    _hold_credits(db, user.id, _retry_holds(db, batch, retry), now)
    for item in retry:
        item.attempts += 1
        item.error = None
        item.error_code = None
    batch.status = "processing"
    batch.finished_at = None
    batch.expires_at = None
    batch.updated_at = now
    queue_conversions(db, batch, [item for item in retry if item.scene_id is None], tier, now)
    for item in retry:
        if item.scene_id is not None:
            queue_design_renders(db, batch, item, db.get(Scene, item.scene_id), now)
    try:
        db.commit()
    except IntegrityError as exc:
        # Another batch reserved one of these SKUs after the check.
        db.rollback()
        raise HTTPException(status_code=409, detail=f"A SKU was reserved meanwhile; {SKU_RESERVED}") from exc
    db.refresh(batch)
    return batch, [item.id for item in retry], refused


def retry_item(db: Session, user: User, batch_id: int, item_id: int) -> IngestItem:
    """Run one failed design again; 409 with the reason when it can't."""
    _, _, refused = retry_items(db, user, batch_id, [item_id])
    if refused:
        raise HTTPException(status_code=409, detail=refused[0].message)
    return db.get(IngestItem, item_id)


def _stop_jobs(db: Session, batch_id: int, now: datetime) -> list[int]:
    """The batch's queued jobs end canceled; its running ones are asked to stop, as a user's
    cancel does (render_jobs.service.cancel_job), and end canceled and refunded when their
    workers stop. An archive of what it made before goes on. Returns the canceled ones, which
    the caller refunds. Not committed."""
    canceled = db.execute(
        update(RenderJob)
        .where(RenderJob.batch_id == batch_id, RenderJob.kind != ARCHIVE_KIND, RenderJob.status == "queued")
        .values(status="canceled", finished_at=now, updated_at=now)
        .returning(RenderJob.id)
        .execution_options(synchronize_session=False)
    ).scalars().all()
    db.execute(
        update(RenderJob)
        .where(RenderJob.batch_id == batch_id, RenderJob.kind != ARCHIVE_KIND, RenderJob.status == "running")
        .values(cancel_requested_at=func.coalesce(RenderJob.cancel_requested_at, now), updated_at=now)
        .execution_options(synchronize_session=False)
    )
    return list(canceled)


def _refund_jobs(db: Session, job_ids: list[int]) -> None:
    """Give back what these canceled jobs held, each once. Not committed."""
    if job_ids:
        for job in db.execute(select(RenderJob).where(RenderJob.id.in_(job_ids), RenderJob.credit_state == "held")).scalars():
            refund_render_job(db, job)


def cancel_batch(db: Session, user: User, batch_id: int) -> IngestBatch:
    """Cancel what hasn't finished: queued conversions and renders at once, running ones when
    their workers stop, and every unfinished design, which gets back what it holds. Everything
    not finished is refunded; what completed stays, as do the scenes made already. A canceled
    batch is answered as it is; a finished one is 409."""
    lock_owner_batches(db, user.id)
    batch = owned_batch(db, user, batch_id)
    if batch.status == "canceled":
        db.commit()
        return batch
    if batch.status not in OPEN_BATCH_STATUSES:
        raise HTTPException(status_code=409, detail=f"Batch is already {batch.status}")
    now = datetime.utcnow()
    # Jobs first, then their designs, then the owner's billing row: the order a worker takes them.
    stopped = _stop_jobs(db, batch.id, now)
    items = locked_items(db, IngestItem.batch_id == batch.id, IngestItem.status.in_(UNFINISHED_ITEM_STATUSES))
    for item in items:
        item.status = "canceled"
        item.error = "Canceled with its batch."
        item.error_code = "canceled"
        item.updated_at = now
    db.flush()
    _refund_jobs(db, stopped)
    release_held_credits(db, [item.id for item in items])
    batch.status = "canceled"
    batch.finished_at = now
    batch.expires_at = now + timedelta(days=RETENTION_DAYS)
    batch.updated_at = now
    db.commit()
    # A conversion completing as this ran may have queued its design's renders once the jobs were
    # stopped. None can be queued now that its design is canceled, so stop those too.
    _refund_jobs(db, _stop_jobs(db, batch.id, datetime.utcnow()))
    db.commit()
    db.refresh(batch)
    return batch
