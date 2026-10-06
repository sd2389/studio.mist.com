"""Render jobs for workers: claims, leases, heartbeats and failures (docs/adr/0005-server-exports.md).

A worker claims a job of the kinds it renders with X-Worker-Token, then acts on that job with
the job's own token, in X-Job-Token: it reads the payload (payload.py), heartbeats, uploads its
outputs and completes the job (outputs.py), or fails it with a code. A lease lives only as long
as its heartbeats; a job whose lease ran out is taken back by the next claim as a failed attempt.
Completing a job charges the credits it held at creation; ending it failed or canceled refunds them.
"""

from __future__ import annotations

import hmac
from collections.abc import Collection
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.config import Settings, get_settings
from app.core import storage
from app.core import storage_keys as keys
from app.features.billing.quota_service import refund_render_job
from app.models.render_job import RenderJob
from app.schemas.render_job import RenderJobHeartbeatOut

HEARTBEAT_SECONDS = 20
# How long one attempt may run, by kind. Past it, heartbeats answer cancel and no longer extend
# the lease, and a failure is final.
MAX_RUNTIME_SECONDS = {
    "still": 5 * 60,
    "angle_set": 10 * 60,
    "turntable": 30 * 60,
    "spin": 15 * 60,
    "campaign_pack": 60 * 60,
    "convert": 10 * 60,
    "batch_archive": 30 * 60,
}
# Failures another attempt may fix. They go back to the queue after 30 s, doubling each attempt.
RETRYABLE_CODES = frozenset({"lease_expired", "browser_crashed", "gpu_lost", "upload_failed", "encode_failed", "unknown"})
RETRY_BACKOFF_SECONDS = 30
LEASE_EXPIRED_ERROR = "worker lease expired"
# Postgres advisory lock taken with an owner's id while a claim counts their running jobs, so
# two claims at once can't both pass the owner's running cap.
_OWNER_CLAIM_LOCK = 5005
# Lapsed leases one claim takes back at most; the next claim takes the rest.
_LAPSED_PER_CLAIM = 100


def _tokens_match(given: str, expected: str) -> bool:
    """Compared in constant time, as bytes: compare_digest refuses a str with non-ASCII characters."""
    return hmac.compare_digest(given.encode(), expected.encode())


def worker_tokens(settings: Settings) -> list[str]:
    """RENDER_WORKER_TOKEN's tokens: several at once while one is rotated in."""
    return [token.strip() for token in (settings.render_worker_token or "").split(",") if token.strip()]


def require_worker_token(x_worker_token: str | None, settings: Settings | None = None) -> None:
    """503 when RENDER_WORKER_TOKEN is not configured; 401 when the header matches none of its tokens."""
    if settings is None:
        settings = get_settings()
    tokens = worker_tokens(settings)
    if not tokens:
        raise HTTPException(status_code=503, detail="Worker endpoint not configured")
    # Every token is compared, so the time taken doesn't tell which one matched.
    matches = [_tokens_match(x_worker_token or "", token) for token in tokens]
    if not x_worker_token or not any(matches):
        raise HTTPException(status_code=401, detail="Invalid worker token")


def _uses_row_locks(db: Session) -> bool:
    """SQLite (tests only, no concurrency) has no FOR UPDATE; real errors elsewhere propagate."""
    return db.get_bind().dialect.name != "sqlite"


def _locked_job(db: Session, job_id: int) -> RenderJob | None:
    """The job, its row locked until this transaction ends (Postgres).

    The worker routes check the token and then update the job; the lock keeps a claim from
    issuing a new token in between. Either they finish first and the claim's SKIP LOCKED passes
    the row by, or they wait for the claim and then see its token and refuse.
    """
    stmt = select(RenderJob).where(RenderJob.id == job_id).execution_options(populate_existing=True)
    if _uses_row_locks(db):
        stmt = stmt.with_for_update()
    return db.execute(stmt).scalars().first()


def running_job(db: Session, job_id: int, token: str, *, lock: bool = True) -> RenderJob:
    """The running job this token was issued for: 404 unknown, 401 wrong token (a claim that
    lost its lease holds an old one), 409 not running. Locked unless `lock` is False."""
    job = _locked_job(db, job_id) if lock else db.get(RenderJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Render job not found")
    if not _tokens_match(token, job.worker_token):
        raise HTTPException(status_code=401, detail="Invalid job token")
    if job.status != "running":
        raise HTTPException(status_code=409, detail=f"Job is in state '{job.status}', expected 'running'")
    return job


def max_runtime_seconds(kind: str) -> int:
    return MAX_RUNTIME_SECONDS[kind]


def _past_runtime(job: RenderJob, now: datetime) -> bool:
    """Whether the current attempt has run as long as its kind may."""
    return job.started_at is not None and now >= job.started_at + timedelta(seconds=max_runtime_seconds(job.kind))


# ---------------------------------------------------------------------------
# Ending attempts
# ---------------------------------------------------------------------------


def discard_outputs(job: RenderJob) -> None:
    """Delete what a job that won't complete uploaded; nothing will ever list those files."""
    for name in job.spec.get("output_names") or []:
        storage.delete_quietly(keys.render_job_output_key(job.user_id, job.id, name))


def _end_job(db: Session, job: RenderJob, now: datetime, status: str) -> None:
    """End a job that won't run again, failed or canceled, and refund it. Not committed."""
    job.status = status
    job.stage = None
    job.finished_at = now
    job.updated_at = now
    refund_render_job(db, job)


def _requeue(job: RenderJob, now: datetime) -> None:
    """Queue the job again after a backoff: 30 s after its first attempt, 60 s after its second."""
    job.status = "queued"
    job.run_after = now + timedelta(seconds=RETRY_BACKOFF_SECONDS * 2 ** max(job.attempts - 1, 0))
    job.lease_expires_at = None
    job.progress = 0.0
    job.stage = None
    job.updated_at = now


def end_attempt(db: Session, job: RenderJob, now: datetime, *, code: str, error: str, retryable: bool) -> bool:
    """Record a failed attempt and say whether the job ended. Not committed.

    A job its owner asked to cancel ends canceled. A retryable failure with attempts left goes
    back to the queue; anything else ends the job failed. Ending refunds the held credits.
    """
    job.error = error
    job.error_code = code
    if job.cancel_requested_at is not None:
        job.error_code = "canceled"
        _end_job(db, job, now, "canceled")
        return True
    if retryable and code in RETRYABLE_CODES and job.attempts < job.max_attempts:
        _requeue(job, now)
        return False
    _end_job(db, job, now, "failed")
    return True


def fail_job(db: Session, job_id: int, token: str, *, error: str, code: str, retryable: bool) -> RenderJob:
    """A worker reports that it couldn't finish the job.

    The failure is retried when the worker says it may be and its code is one another attempt
    may fix, while attempts are left. An attempt that ran past its kind's run time is final and
    recorded as a timeout; a job its owner asked to cancel ends canceled.
    """
    job = running_job(db, job_id, token)
    now = datetime.utcnow()
    if _past_runtime(job, now):
        code, retryable = "timeout", False
    ended = end_attempt(db, job, now, code=code, error=error, retryable=retryable)
    db.commit()
    if ended:
        discard_outputs(job)
    db.refresh(job)
    return job


# ---------------------------------------------------------------------------
# Claims and leases
# ---------------------------------------------------------------------------


def take_back_lapsed_leases(db: Session, now: datetime) -> None:
    """Running jobs whose lease ran out: their workers crashed or hung, so each of those
    attempts failed (`lease_expired`), as if the worker had said so. A fresh token, held by
    nobody, shuts the worker that lost the lease out of the job."""
    stmt = (
        select(RenderJob)
        .where(RenderJob.status == "running", RenderJob.lease_expires_at < now)
        .order_by(RenderJob.lease_expires_at)
        .limit(_LAPSED_PER_CLAIM)
    )
    if _uses_row_locks(db):
        stmt = stmt.with_for_update(skip_locked=True)
    lapsed = list(db.execute(stmt).scalars())
    ended = []
    for job in lapsed:
        job.worker_token = uuid4().hex
        if end_attempt(db, job, now, code="lease_expired", error=LEASE_EXPIRED_ERROR, retryable=True):
            ended.append(job)
    if lapsed:
        db.commit()
    for job in ended:
        discard_outputs(job)


def _next_job_query(kinds: Collection[str], now: datetime, full_owners: set[int], lock: bool):
    """The queued job to run next: the highest priority, then the oldest, of the kinds asked for,
    whose backoff has passed and whose owner runs fewer jobs than their plan's running cap."""
    running = aliased(RenderJob)
    owner_running = (
        select(func.count())
        .select_from(running)
        .where(running.user_id == RenderJob.user_id, running.status == "running")
        .scalar_subquery()
    )
    stmt = (
        select(RenderJob)
        .where(
            RenderJob.status == "queued",
            RenderJob.kind.in_(kinds),
            or_(RenderJob.run_after.is_(None), RenderJob.run_after <= now),
            owner_running < RenderJob.max_running,
        )
        .order_by(RenderJob.priority.desc(), RenderJob.created_at, RenderJob.id)
        .limit(1)
    )
    if full_owners:
        stmt = stmt.where(RenderJob.user_id.not_in(full_owners))
    if lock:
        stmt = stmt.with_for_update(skip_locked=True, of=RenderJob)
    return stmt


def _owner_has_room(db: Session, job: RenderJob) -> bool:
    """Whether the job's owner still runs fewer jobs than its cap, counted under a lock per
    owner (Postgres): another claim for the same owner may have started one since the query."""
    db.execute(select(func.pg_advisory_xact_lock(_OWNER_CLAIM_LOCK, job.user_id)))
    running = db.execute(
        select(func.count())
        .select_from(RenderJob)
        .where(RenderJob.user_id == job.user_id, RenderJob.status == "running")
    ).scalar_one()
    return running < job.max_running


def _start_attempt(job: RenderJob, worker_id: str, now: datetime, settings: Settings) -> None:
    job.status = "running"
    job.attempts += 1
    job.worker_id = worker_id
    job.worker_token = uuid4().hex
    job.lease_expires_at = now + timedelta(seconds=settings.render_job_lease_seconds)
    job.heartbeat_at = None
    job.progress = 0.0
    job.stage = None
    job.run_after = None
    job.started_at = now
    job.updated_at = now


def claim_job(
    db: Session, worker_id: str, kinds: Collection[str], settings: Settings | None = None
) -> RenderJob | None:
    """Claim the next job for a worker that renders `kinds`, or None (204) when there is none.

    Lapsed leases are taken back first. The claim issues a fresh per-job token and a lease of
    RENDER_JOB_LEASE_SECONDS, which heartbeats extend. Queued jobs are claimed with SELECT ...
    FOR UPDATE SKIP LOCKED, so workers claiming at once take different jobs.
    """
    if settings is None:
        settings = get_settings()
    now = datetime.utcnow()
    take_back_lapsed_leases(db, now)
    locks = _uses_row_locks(db)
    full_owners: set[int] = set()
    while True:
        job = db.execute(_next_job_query(kinds, now, full_owners, locks)).scalars().first()
        if job is None:
            return None
        if locks and not _owner_has_room(db, job):
            # Another claim started one of this owner's jobs after the query: pass the owner by.
            full_owners.add(job.user_id)
            db.rollback()
            continue
        _start_attempt(job, worker_id, now, settings)
        db.commit()
        db.refresh(job)
        return job


def heartbeat(
    db: Session,
    job_id: int,
    token: str,
    *,
    progress: float | None,
    stage: str | None,
    settings: Settings | None = None,
) -> RenderJobHeartbeatOut:
    """Keep a running job's lease and record its progress.

    The lease runs another RENDER_JOB_LEASE_SECONDS from now until the attempt reaches its
    kind's run time; from then on it is no longer extended. The answer says `cancel` once the
    owner has asked to stop the job or its run time is up: the worker then stops and fails it.
    """
    if settings is None:
        settings = get_settings()
    job = running_job(db, job_id, token)
    now = datetime.utcnow()
    timed_out = _past_runtime(job, now)
    if not timed_out:
        job.lease_expires_at = now + timedelta(seconds=settings.render_job_lease_seconds)
    if progress is not None:
        job.progress = progress
    if stage is not None:
        job.stage = stage
    job.heartbeat_at = now
    job.updated_at = now
    db.commit()
    db.refresh(job)
    return RenderJobHeartbeatOut(
        lease_expires_at=job.lease_expires_at,
        cancel=timed_out or job.cancel_requested_at is not None,
    )
