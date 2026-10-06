"""A batch after it is made: submitting it (its credits held, its uploaded designs converting),
retrying designs that failed, and canceling what hasn't finished, refunded
(docs/adr/0006-bulk-pipeline.md, "Credits for a batch" and "The batch page").

Each change is one transaction under the owner's lock. Credits are held for a batch's designs
together, with one conditional UPDATE (402 naming the shortfall); each design keeps what it
holds, and gets it back once when it fails or is canceled.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.features.billing.plans import get_batch_limits
from app.features.billing.quota_service import hold_batch_credits, refund_render_job
from app.features.ingest.conversions import queue_conversions
from app.features.ingest.items import RETENTION_DAYS, lock_owner_batches, locked_items, release_held_credits
from app.features.ingest.service import assert_batch_fits_plan, assert_open_batch_room, owned_batch, owner_tier
from app.features.scene.skus import SKU_RESERVED, SKU_TAKEN, sku_holders
from app.models import IngestBatch, IngestItem, RenderJob, User
from app.models.ingest import OPEN_BATCH_STATUSES, UNFINISHED_ITEM_STATUSES
from app.schemas.ingest import IngestRefusal


def _hold_credits(db: Session, user_id: int, batch: IngestBatch, items: list[IngestItem], now: datetime) -> None:
    """A model credit and the render plan's credits for each design, held together (402 when
    short) and kept on each design. Not committed."""
    period_start = hold_batch_credits(db, user_id, len(items), len(items) * batch.render_credits_per_design)
    for item in items:
        item.model_credit_held = 1
        item.render_credits_held = batch.render_credits_per_design
        item.credits_period_start = period_start
        item.updated_at = now


def submit_batch(db: Session, user: User, batch_id: int) -> IngestBatch:
    """Hold every design's credits and start converting the uploaded ones; the others start when
    their uploads are confirmed. 402, and nothing held, when the owner's plan no longer takes
    the batch or the credits are short. A batch submitted already is answered as it is; a
    canceled one is 409."""
    lock_owner_batches(db, user.id)
    batch = owned_batch(db, user, batch_id)
    if batch.status == "canceled":
        raise HTTPException(status_code=409, detail="Batch is canceled")
    if batch.status != "draft":
        db.commit()
        return batch
    tier = owner_tier(db, user)
    assert_batch_fits_plan(tier, batch.item_count, batch.total_bytes)
    items = locked_items(db, IngestItem.batch_id == batch.id)
    now = datetime.utcnow()
    _hold_credits(db, user.id, batch, items, now)
    batch.status = "processing"
    batch.submitted_at = now
    batch.updated_at = now
    queue_conversions(db, batch, [item for item in items if item.status == "uploaded"], tier, now)
    db.commit()
    db.refresh(batch)
    return batch


def _refusals(db: Session, items: list[IngestItem], asked: bool) -> tuple[list[IngestItem], list[IngestRefusal]]:
    """The designs that can convert again, and why the others can't: not failed (when asked for
    by id), or their SKU since taken by a scene or reserved by another design."""
    refused = [
        IngestRefusal(item_id=item.id, code="not_failed", message=f"Item {item.id} is {item.status}, not failed.")
        for item in items
        if asked and item.status != "failed"
    ]
    failed = [item for item in items if item.status == "failed"]
    holders = sku_holders(db, [item.sku for item in failed], except_item_ids=[item.id for item in failed])
    for item in failed:
        if holder := holders.get(item.sku):
            message = SKU_TAKEN if holder == "taken" else SKU_RESERVED
            refused.append(IngestRefusal(item_id=item.id, code=f"sku_{holder}", message=f"{item.sku}: {message}."))
    return [item for item in failed if item.sku not in holders], refused


def retry_items(
    db: Session, user: User, batch_id: int, item_ids: list[int] | None = None
) -> tuple[IngestBatch, list[int], list[IngestRefusal]]:
    """Convert failed designs again from their uploaded files, all of them or those named,
    holding their credits again (402 when short). A design whose SKU was taken meanwhile is
    refused and stays failed. A batch that had finished opens again, if the owner may have
    another open (429). 409 for a batch not yet submitted, or canceled."""
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
    retry, refused = _refusals(db, items, asked=item_ids is not None)
    if not retry:
        db.commit()
        return batch, [], refused
    tier = owner_tier(db, user)
    assert_batch_fits_plan(tier, batch.item_count, batch.total_bytes)
    if batch.status != "processing":
        assert_open_batch_room(db, user.id, get_batch_limits(tier))
    now = datetime.utcnow()
    _hold_credits(db, user.id, batch, retry, now)
    for item in retry:
        item.attempts += 1
        item.error = None
        item.error_code = None
    batch.status = "processing"
    batch.finished_at = None
    batch.expires_at = None
    batch.updated_at = now
    queue_conversions(db, batch, retry, tier, now)
    try:
        db.commit()
    except IntegrityError as exc:
        # Another batch reserved one of these SKUs after the check.
        db.rollback()
        raise HTTPException(status_code=409, detail=f"A SKU was reserved meanwhile; {SKU_RESERVED}") from exc
    db.refresh(batch)
    return batch, [item.id for item in retry], refused


def retry_item(db: Session, user: User, batch_id: int, item_id: int) -> IngestItem:
    """Convert one failed design again; 409 with the reason when it can't."""
    _, _, refused = retry_items(db, user, batch_id, [item_id])
    if refused:
        raise HTTPException(status_code=409, detail=refused[0].message)
    return db.get(IngestItem, item_id)


def _cancel_jobs(db: Session, batch_id: int, now: datetime) -> None:
    """The batch's queued jobs end canceled, refunded; its running ones are asked to stop, as a
    user's cancel does (render_jobs.service.cancel_job). Not committed."""
    canceled = db.execute(
        update(RenderJob)
        .where(RenderJob.batch_id == batch_id, RenderJob.status == "queued")
        .values(status="canceled", finished_at=now, updated_at=now)
        .returning(RenderJob.id)
        .execution_options(synchronize_session=False)
    ).scalars().all()
    if canceled:
        held = select(RenderJob).where(RenderJob.id.in_(canceled), RenderJob.credit_state == "held")
        for job in db.execute(held).scalars():
            refund_render_job(db, job)
    db.execute(
        update(RenderJob)
        .where(RenderJob.batch_id == batch_id, RenderJob.status == "running")
        .values(cancel_requested_at=func.coalesce(RenderJob.cancel_requested_at, now), updated_at=now)
        .execution_options(synchronize_session=False)
    )


def cancel_batch(db: Session, user: User, batch_id: int) -> IngestBatch:
    """Cancel what hasn't finished: queued conversions at once, running ones when their workers
    stop, and every unfinished design, which gets back what it holds. Scenes made already stay.
    A canceled batch is answered as it is; a finished one is 409."""
    lock_owner_batches(db, user.id)
    batch = owned_batch(db, user, batch_id)
    if batch.status == "canceled":
        db.commit()
        return batch
    if batch.status not in OPEN_BATCH_STATUSES:
        raise HTTPException(status_code=409, detail=f"Batch is already {batch.status}")
    now = datetime.utcnow()
    _cancel_jobs(db, batch.id, now)  # jobs first: a worker locks a job, then its design
    items = locked_items(db, IngestItem.batch_id == batch.id, IngestItem.status.in_(UNFINISHED_ITEM_STATUSES))
    for item in items:
        item.status = "canceled"
        item.error = "Canceled with its batch."
        item.error_code = "canceled"
        item.updated_at = now
    db.flush()
    release_held_credits(db, [item.id for item in items])
    batch.status = "canceled"
    batch.finished_at = now
    batch.expires_at = now + timedelta(days=RETENTION_DAYS)
    batch.updated_at = now
    db.commit()
    db.refresh(batch)
    return batch
