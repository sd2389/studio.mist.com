"""A batch's designs as they move on: the credits they hold, a design ending with its convert job or
moving on as its render jobs end, and a batch settling once nothing of it is left to finish
(docs/adr/0006-bulk-pipeline.md).

Changes take their row locks in one order: render jobs, then designs, then the owner's billing
row, then the batch. A worker finishing a job starts from the job and locks its design before it
charges or refunds anything, so a user acting on a batch at the same time never waits for a lock
while holding one the worker waits for. An owner's own changes to their batches go one at a time
(lock_owner_batches).
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection, Iterable
from datetime import datetime, timedelta

from sqlalchemy import case, exists, func, select, update
from sqlalchemy.orm import Session

from app.features.billing.quota_service import return_held_credits
from app.models.ingest import UNFINISHED_ITEM_STATUSES, IngestBatch, IngestItem
from app.models.render_job import RenderJob

# How long a finished batch's raw CAD files and archives are kept.
RETENTION_DAYS = 30
# Postgres advisory lock taken with an owner's id around their changes to their batches.
_OWNER_BATCHES_LOCK = 6006
UNFINISHED_JOB_STATUSES = ("queued", "running")
# A job that ended without completing: its design fails, whatever its other jobs do.
_JOB_ENDED_SHORT = ("failed", "canceled")


def uses_row_locks(db: Session) -> bool:
    """SQLite (tests only, no concurrency) has neither FOR UPDATE nor advisory locks."""
    return db.get_bind().dialect.name != "sqlite"


def lock_owner_batches(db: Session, user_id: int) -> None:
    """Take an owner's batches for this transaction (Postgres), so their own changes go one at a
    time: counting their open batches, holding credits for designs, giving them back."""
    if uses_row_locks(db):
        db.execute(select(func.pg_advisory_xact_lock(_OWNER_BATCHES_LOCK, user_id)))


def locked_items(db: Session, *conditions) -> list[IngestItem]:
    """The designs that match, their rows locked until the transaction ends (Postgres)."""
    stmt = (
        select(IngestItem)
        .where(*conditions)
        .order_by(IngestItem.id)
        .execution_options(populate_existing=True)
    )
    if uses_row_locks(db):
        stmt = stmt.with_for_update()
    return list(db.execute(stmt).scalars())


def lock_design_of(db: Session, job: RenderJob) -> None:
    """Lock the design a job is for, if it is one's, before anything is charged or refunded: the
    order every change takes (see above). Not committed."""
    if job.ingest_item_id is not None:
        locked_items(db, IngestItem.id == job.ingest_item_id)


def release_held_credits(db: Session, item_ids: Collection[int]) -> None:
    """Give back what these designs still hold, each credit once: their rows are locked, read and
    zeroed, and the credits go back to the owner's balances (return_held_credits): the bought ones
    as bought, the plan ones unless an allowance has replaced the plan credits since they were
    held. Each design counts what it was given back. Not committed."""
    held = [item for item in locked_items(db, IngestItem.id.in_(item_ids)) if item.model_credit_held or item.render_credits_held]
    if not held:
        return
    totals: dict[tuple[int, int], list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for item in held:
        total = totals[(item.user_id, item.credits_allowance_generation)]
        total[0] += item.model_credit_held
        total[1] += item.render_credits_held
        total[2] += item.bought_model_credit_held
        total[3] += item.bought_render_credits_held
        item.model_credits_refunded += item.model_credit_held
        item.render_credits_refunded += item.render_credits_held
        item.model_credit_held = 0
        item.render_credits_held = 0
        item.bought_model_credit_held = 0
        item.bought_render_credits_held = 0
    db.flush()
    for (user_id, allowance_generation), (model_credits, render_credits, bought_model, bought_render) in totals.items():
        return_held_credits(
            db,
            user_id,
            allowance_generation,
            model_credits=model_credits,
            render_credits=render_credits,
            bought_model_credits=bought_model,
            bought_render_credits=bought_render,
        )


def settle_batch(db: Session, batch_id: int | None) -> None:
    """A processing batch whose designs have all finished, and whose jobs have all ended, becomes
    completed, or completed with errors when any design isn't done, and its raw files are kept 30
    days more. The batch row is locked first, so two designs finishing at once can't each miss the
    other. Not committed."""
    if batch_id is None:
        return
    db.flush()  # the jobs' and designs' own ends, which it is judged by (the API's sessions don't autoflush)
    if uses_row_locks(db):
        db.execute(select(IngestBatch.id).where(IngestBatch.id == batch_id).with_for_update())
    unfinished = exists().where(IngestItem.batch_id == IngestBatch.id, IngestItem.status.in_(UNFINISHED_ITEM_STATUSES))
    running = exists().where(RenderJob.batch_id == IngestBatch.id, RenderJob.status.in_(UNFINISHED_JOB_STATUSES))
    not_done = exists().where(IngestItem.batch_id == IngestBatch.id, IngestItem.status != "done")
    now = datetime.utcnow()
    db.execute(
        update(IngestBatch)
        .where(IngestBatch.id == batch_id, IngestBatch.status == "processing", ~unfinished, ~running)
        .values(
            status=case((not_done, "completed_with_errors"), else_="completed"),
            finished_at=now,
            expires_at=now + timedelta(days=RETENTION_DAYS),
            updated_at=now,
        )
        .execution_options(synchronize_session=False)
    )


def newest_of_each_kind(jobs: Iterable[RenderJob]) -> list[RenderJob]:
    """Of one design's render jobs, those that count: the newest of each kind, since a retry's job
    stands in for the one it renders again."""
    return list({job.kind: job for job in sorted(jobs, key=lambda job: job.id)}.values())


def current_render_jobs(db: Session, item_id: int) -> list[RenderJob]:
    """A design's render jobs that count (newest_of_each_kind)."""
    jobs = db.execute(
        select(RenderJob)
        .where(RenderJob.ingest_item_id == item_id, RenderJob.kind != "convert")
        .execution_options(populate_existing=True)  # as stored now: some changes go by UPDATE alone
    ).scalars()
    return newest_of_each_kind(jobs)


def render_outcome(jobs: Iterable[RenderJob]) -> str:
    """Where a rendering design is: failed once any of its jobs ended without completing, done once
    every one has completed, else still rendering."""
    statuses = [job.status for job in jobs]
    if any(status in _JOB_ENDED_SHORT for status in statuses):
        return "failed"
    if statuses and all(status == "completed" for status in statuses):
        return "done"
    return "rendering"


def _end_render_of_job(db: Session, job: RenderJob) -> None:
    """A design's render job ended: the design moves on by what its jobs come to, failed with the
    first reason one gave. A design no longer rendering (canceled, or failed already) stays as it
    is. Not committed."""
    db.flush()  # the job's own end, which its design is judged by
    [item] = locked_items(db, IngestItem.id == job.ingest_item_id) or [None]
    if item is None or item.status != "rendering":
        return
    jobs = current_render_jobs(db, item.id)
    outcome = render_outcome(jobs)
    if outcome == "rendering":
        return
    item.status = outcome
    item.error, item.error_code = None, None
    if ended_short := next((one for one in jobs if one.status in _JOB_ENDED_SHORT), None):
        canceled = ended_short.status == "canceled"
        item.error = ended_short.error or ("Its render was canceled." if canceled else "The render failed.")
        item.error_code = ended_short.error_code or ("canceled" if canceled else "unknown")
    item.updated_at = datetime.utcnow()


def _end_conversion_of_job(db: Session, job: RenderJob, status: str) -> bool:
    """A design whose convert job ended without completing ends with it: canceled with a canceled
    job, else failed with the job's reason; it gets back what it holds. Whether it ended. Not
    committed."""
    canceled = status == "canceled"
    ended = db.execute(
        update(IngestItem)
        .where(
            IngestItem.id == job.ingest_item_id,
            IngestItem.status == "converting",
            IngestItem.convert_job_id == job.id,
        )
        .values(
            status="canceled" if canceled else "failed",
            error=job.error or ("Canceled." if canceled else "The conversion failed."),
            error_code=job.error_code or ("canceled" if canceled else "unknown"),
            updated_at=datetime.utcnow(),
        )
        .execution_options(synchronize_session=False)
    ).rowcount
    if ended:
        release_held_credits(db, [job.ingest_item_id])
    return bool(ended)


def end_item_of_job(db: Session, job: RenderJob, status: str) -> None:
    """A design's job ended. A convert job that didn't complete ends its design; a render job,
    completed or not, moves its design on. Its batch settles. Not committed."""
    if job.ingest_item_id is None:
        return
    if job.kind == "convert":
        if _end_conversion_of_job(db, job, status):
            settle_batch(db, job.batch_id)
        return
    _end_render_of_job(db, job)
    settle_batch(db, job.batch_id)
