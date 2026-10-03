"""Render jobs for workers: claim, payload, complete and fail.

The protocol before ADR 0005's A2: a worker claims a still and renders one PNG of a material
preset and a lighting preset. Only stills are claimed. Completing a job charges the credits it
held at creation; ending it failed or canceled refunds them.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.storage import presign_get, write_bytes
from app.core.storage_keys import render_key
from app.features.billing.quota_service import charge_render_job, refund_render_job
from app.models.render_job import RenderJob
from app.schemas.render_job import RenderJobPayload

LEASE_EXPIRED_ERROR = "worker lease expired"
# The kinds this protocol renders.
CLAIMABLE_KINDS = ("still",)


def require_worker_token(
    x_worker_token: str | None,
    settings: Settings | None = None,
) -> None:
    """Validate X-Worker-Token.

    Raises 503 when RENDER_WORKER_TOKEN is not configured.
    Raises 401 when token is absent or does not match.
    """
    if settings is None:
        settings = get_settings()

    if not settings.render_worker_token:
        raise HTTPException(status_code=503, detail="Worker endpoint not configured")

    if not x_worker_token or x_worker_token != settings.render_worker_token:
        raise HTTPException(status_code=401, detail="Invalid worker token")


def _end_unfinished_job(db: Session, job: RenderJob, now: datetime) -> None:
    """End a job that won't run again, refunded: canceled when its owner asked, else failed.

    Not committed.
    """
    job.status = "canceled" if job.cancel_requested_at else "failed"
    job.finished_at = now
    job.updated_at = now
    refund_render_job(db, job)


def claim_job(db: Session, settings: Settings | None = None) -> RenderJob | None:
    """Atomically claim the oldest queued still, or a running one whose lease ran out.

    Sets status='running', increments attempts, issues a fresh per-job token and
    a lease of RENDER_JOB_LEASE_SECONDS. Returns None when nothing is claimable
    (router should respond 204).

    A lease runs out when its worker crashed or hung, so that attempt counts as
    failed, as if the worker had called fail: a job out of attempts, or one its
    owner asked to cancel, ends instead of being claimed again. The fresh token
    shuts the worker that lost the lease out of payload, complete and fail.

    Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent claiming.
    SQLite (tests only, concurrency irrelevant) doesn't support the clause,
    so it takes an explicit no-lock path gated on the dialect — real errors
    on other databases propagate.
    """
    if settings is None:
        settings = get_settings()

    now = datetime.utcnow()
    lapsed = and_(RenderJob.status == "running", RenderJob.lease_expires_at < now)
    stmt = (
        select(RenderJob)
        .where(RenderJob.kind.in_(CLAIMABLE_KINDS), or_(RenderJob.status == "queued", lapsed))
        .order_by(RenderJob.created_at)
        .limit(1)
    )
    if db.get_bind().dialect.name != "sqlite":
        stmt = stmt.with_for_update(skip_locked=True)

    while True:
        job = db.execute(stmt).scalars().first()
        if job is None:
            return None

        if job.status == "running":
            # Its worker never reported back: that attempt failed, as if it had called fail.
            job.error = LEASE_EXPIRED_ERROR
            if job.cancel_requested_at or job.attempts >= job.max_attempts:
                _end_unfinished_job(db, job, now)
                db.commit()
                continue

        job.status = "running"
        job.attempts += 1
        job.worker_token = uuid4().hex
        job.lease_expires_at = now + timedelta(seconds=settings.render_job_lease_seconds)
        job.started_at = job.started_at or now
        job.updated_at = now
        db.commit()
        db.refresh(job)
        return job


def get_job_payload(db: Session, job_id: int, token: str) -> RenderJobPayload:
    """Return render parameters for a job.

    Raises 401 if token != job.worker_token (a claim that lost its lease holds
    an outdated one).
    model_url is the model_ref as-is when it starts with 'http',
    otherwise a presigned GET URL.
    """
    job = db.execute(
        select(RenderJob).where(RenderJob.id == job_id)
    ).scalars().first()

    if job is None:
        raise HTTPException(status_code=404, detail="Render job not found")

    if token != job.worker_token:
        raise HTTPException(status_code=401, detail="Invalid job token")

    if job.model_ref.startswith("http"):
        model_url = job.model_ref
    else:
        model_url = presign_get(job.model_ref)

    return RenderJobPayload(
        model_url=model_url,
        lighting=job.lighting,
        preset=job.preset,
        width=job.width,
        height=job.height,
        watermark=job.watermark,
    )


def _lock_job(db: Session, job_id: int) -> RenderJob | None:
    """The job, its row locked until this transaction ends (Postgres).

    complete and fail check the token and then update the job; the lock keeps a claim from
    issuing a new token in between. Either they finish first and the claim's SKIP LOCKED
    passes the row by, or they wait for the claim and then see its token and refuse.
    """
    stmt = select(RenderJob).where(RenderJob.id == job_id).execution_options(populate_existing=True)
    if db.get_bind().dialect.name != "sqlite":
        stmt = stmt.with_for_update()
    return db.execute(stmt).scalars().first()


def _running_job(db: Session, job_id: int, token: str) -> RenderJob:
    """The locked job this token runs: 404 unknown, 401 wrong token, 409 not running."""
    job = _lock_job(db, job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Render job not found")

    if token != job.worker_token:
        raise HTTPException(status_code=401, detail="Invalid job token")

    if job.status != "running":
        raise HTTPException(status_code=409, detail=f"Job is in state '{job.status}', expected 'running'")

    return job


def complete_job(db: Session, job_id: int, token: str, data: bytes) -> RenderJob:
    """Mark a running job completed, store its PNG and charge the credits it held.

    Raises:
        401 – wrong token, including one from a claim that lost its lease.
        409 – job is not in 'running' state (idempotency guard).
    """
    job = _running_job(db, job_id, token)

    key = render_key(job.user_id, "png")
    write_bytes(key, data, content_type="image/png")

    now = datetime.utcnow()
    job.result_key = key
    job.status = "completed"
    job.progress = 1.0
    job.finished_at = now
    job.updated_at = now
    charge_render_job(db, job)

    db.commit()
    db.refresh(job)
    return job


def fail_job(db: Session, job_id: int, token: str, error: str) -> RenderJob:
    """Record a worker failure.

    Raises:
        401 – wrong token, including one from a claim that lost its lease.
        409 – job is not in 'running' state.

    Retry logic (attempts already incremented at claim time):
        attempts < max_attempts  → status = 'queued'  (retry)
        attempts >= max_attempts → status = 'failed'  (terminal, refunded)
    A job its owner asked to cancel ends canceled, refunded, instead of retrying.
    """
    job = _running_job(db, job_id, token)

    now = datetime.utcnow()
    job.error = error
    job.updated_at = now

    if job.cancel_requested_at or job.attempts >= job.max_attempts:
        _end_unfinished_job(db, job, now)
    else:
        job.status = "queued"

    db.commit()
    db.refresh(job)
    return job
