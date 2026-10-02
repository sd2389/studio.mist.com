"""Render-job service: create (credit gate), status (owner-only), and worker ops."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.storage import presign_get, write_bytes
from app.core.storage_keys import render_key
from app.features.billing.plans import get_quotas, normalize_tier
from app.features.billing.quota_service import (
    assert_image_resolution,
    assert_render_credit,
    consume_render_credit,
    get_or_create_billing,
)
from app.features.scene.service import require_owned_scene
from app.models.render_job import RenderJob
from app.models.scene import Scene
from app.models.user import User
from app.schemas.render_job import RenderJobCreate, RenderJobPayload


# ---------------------------------------------------------------------------
# User-facing service
# ---------------------------------------------------------------------------

MAX_ACTIVE_JOBS_PER_USER = 10


def create_job(db: Session, user: User, body: RenderJobCreate) -> RenderJob:
    """Assert credit (no consume), cap active jobs, resolve owned scene, check dims, enqueue."""
    # 402 guard — does NOT consume
    assert_render_credit(db, user)

    # Flood guard — cap concurrent queued/running jobs per user
    active = db.execute(
        select(func.count())
        .select_from(RenderJob)
        .where(
            RenderJob.user_id == user.id,
            RenderJob.status.in_(("queued", "running")),
        )
    ).scalar_one()
    if active >= MAX_ACTIVE_JOBS_PER_USER:
        raise HTTPException(status_code=429, detail="Too many active render jobs")

    # Owner check on scene — 404 if not found or not owned
    scene: Scene = require_owned_scene(db.get(Scene, body.scene_id), user.id)

    # 402 when either side is above the plan's max_image_resolution (no silent downsizing)
    assert_image_resolution(db, user, body.width, body.height)

    now = datetime.utcnow()
    job = RenderJob(
        user_id=user.id,
        scene_id=scene.id,
        model_ref=scene.model_key,
        lighting=body.lighting,
        preset=body.preset,
        width=body.width,
        height=body.height,
        status="queued",
        attempts=0,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job_for_user(db: Session, user: User, job_id: int) -> RenderJob:
    """Return job if owned by user, else 404."""
    job = db.execute(
        select(RenderJob).where(RenderJob.id == job_id)
    ).scalars().first()

    if job is None or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Render job not found")

    return job


# ---------------------------------------------------------------------------
# Worker auth
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Worker operations
# ---------------------------------------------------------------------------


MAX_ATTEMPTS = 3
LEASE_EXPIRED_ERROR = "worker lease expired"


def claim_job(db: Session, settings: Settings | None = None) -> RenderJob | None:
    """Atomically claim the oldest queued job, or a running one whose lease ran out.

    Sets status='running', increments attempts, issues a fresh per-job token and
    a lease of RENDER_JOB_LEASE_SECONDS. Returns None when nothing is claimable
    (router should respond 204).

    A lease runs out when its worker crashed or hung, so that attempt counts as
    failed, as if the worker had called fail: a job already at MAX_ATTEMPTS
    fails for good instead of being claimed again. The fresh token shuts the
    worker that lost the lease out of payload, complete and fail.

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
        .where(or_(RenderJob.status == "queued", lapsed))
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
            if job.attempts >= MAX_ATTEMPTS:
                job.status = "failed"
                job.updated_at = now
                db.commit()
                continue

        job.status = "running"
        job.attempts += 1
        job.worker_token = uuid4().hex
        job.lease_expires_at = now + timedelta(seconds=settings.render_job_lease_seconds)
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

    owner_plan = normalize_tier(get_or_create_billing(db, db.get(User, job.user_id)).plan_tier)
    return RenderJobPayload(
        model_url=model_url,
        lighting=job.lighting,
        preset=job.preset,
        width=job.width,
        height=job.height,
        watermark=get_quotas(owner_plan).watermark_exports,
    )


def complete_job(db: Session, job_id: int, token: str, data: bytes) -> RenderJob:
    """Mark a running job completed; store PNG; consume 1 render credit.

    Raises:
        401 – wrong token, including one from a claim that lost its lease.
        409 – job is not in 'running' state (idempotency guard).
    """
    job = db.execute(
        select(RenderJob).where(RenderJob.id == job_id)
    ).scalars().first()

    if job is None:
        raise HTTPException(status_code=404, detail="Render job not found")

    if token != job.worker_token:
        raise HTTPException(status_code=401, detail="Invalid job token")

    if job.status != "running":
        raise HTTPException(status_code=409, detail=f"Job is in state '{job.status}', expected 'running'")

    # Load the job owner to fetch billing
    owner = db.get(User, job.user_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Job owner not found")
    billing = get_or_create_billing(db, owner)

    # Credit precheck BEFORE storing bytes — otherwise the PNG uploads as an
    # orphan the user is never charged for and the worker retry-loops on it.
    if billing.render_credits_balance <= 0:
        job.status = "failed"
        job.error = "no credits at completion"
        job.updated_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=402, detail="No render credits at completion")

    # Store the rendered PNG
    key = render_key(job.user_id, "png")
    write_bytes(key, data, content_type="image/png")

    # Update job state
    job.result_key = key
    job.status = "completed"
    job.updated_at = datetime.utcnow()

    # Consume exactly 1 render credit
    consume_render_credit(db, billing)

    db.commit()
    db.refresh(job)
    return job


def fail_job(db: Session, job_id: int, token: str, error: str) -> RenderJob:
    """Record a worker failure.

    Raises:
        401 – wrong token, including one from a claim that lost its lease.
        409 – job is not in 'running' state.

    Retry logic (attempts already incremented at claim time):
        attempts < MAX_ATTEMPTS  → status = 'queued'  (retry)
        attempts >= MAX_ATTEMPTS → status = 'failed'  (terminal)

    Never touches billing credits.
    """
    job = db.execute(
        select(RenderJob).where(RenderJob.id == job_id)
    ).scalars().first()

    if job is None:
        raise HTTPException(status_code=404, detail="Render job not found")

    if token != job.worker_token:
        raise HTTPException(status_code=401, detail="Invalid job token")

    if job.status != "running":
        raise HTTPException(status_code=409, detail=f"Job is in state '{job.status}', expected 'running'")

    job.error = error
    job.updated_at = datetime.utcnow()

    if job.attempts >= MAX_ATTEMPTS:
        job.status = "failed"
    else:
        job.status = "queued"

    db.commit()
    db.refresh(job)
    return job
