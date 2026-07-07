"""Render-job service: create (credit gate), status (owner-only), and worker ops."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.storage import presign_get, write_bytes
from app.core.storage_keys import render_key
from app.features.billing.plans import get_quotas, normalize_tier
from app.features.billing.quota_service import consume_render_credit, get_or_create_billing, assert_render_credit
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
    """Assert credit (no consume), cap active jobs, resolve owned scene, clamp dims, enqueue."""
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

    # Clamp width/height to plan max_image_resolution
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    quotas = get_quotas(tier)
    max_res = quotas.max_image_resolution
    width = min(body.width, max_res)
    height = min(body.height, max_res)

    now = datetime.utcnow()
    job = RenderJob(
        user_id=user.id,
        scene_id=scene.id,
        model_ref=scene.model_key,
        lighting=body.lighting,
        preset=body.preset,
        width=width,
        height=height,
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


def claim_job(db: Session) -> RenderJob | None:
    """Atomically claim oldest queued job.

    Sets status='running', increments attempts.
    Returns None when the queue is empty (router should respond 204).

    Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent claiming;
    falls back transparently on SQLite (which doesn't support this clause
    but is used only in tests where concurrency is irrelevant).
    """
    try:
        stmt = (
            select(RenderJob)
            .where(RenderJob.status == "queued")
            .order_by(RenderJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        job = db.execute(stmt).scalars().first()
    except Exception:
        # SQLite in tests doesn't support FOR UPDATE — fall back without lock
        stmt = (
            select(RenderJob)
            .where(RenderJob.status == "queued")
            .order_by(RenderJob.created_at)
            .limit(1)
        )
        job = db.execute(stmt).scalars().first()

    if job is None:
        return None

    job.status = "running"
    job.attempts += 1
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


def get_job_payload(db: Session, job_id: int, token: str) -> RenderJobPayload:
    """Return render parameters for a job.

    Raises 401 if token != job.worker_token.
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
    )


def complete_job(db: Session, job_id: int, token: str, data: bytes) -> RenderJob:
    """Mark a running job completed; store PNG; consume 1 render credit.

    Raises:
        401 – wrong token.
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
        401 – wrong token.
        409 – job is not in 'running' state.

    Retry logic (attempts already incremented at claim time):
        attempts < 3  → status = 'queued'  (retry)
        attempts >= 3 → status = 'failed'  (terminal)

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

    if job.attempts >= 3:
        job.status = "failed"
    else:
        job.status = "queued"

    db.commit()
    db.refresh(job)
    return job
