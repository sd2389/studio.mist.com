"""Render-job service: create (credit gate) and status (owner-only)."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.billing.plans import get_quotas, normalize_tier
from app.features.billing.quota_service import get_or_create_billing, assert_render_credit
from app.features.scene.service import require_owned_scene
from app.models.render_job import RenderJob
from app.models.scene import Scene
from app.models.user import User
from app.schemas.render_job import RenderJobCreate


def create_job(db: Session, user: User, body: RenderJobCreate) -> RenderJob:
    """Assert credit (no consume), resolve owned scene, clamp dims, enqueue."""
    # 402 guard — does NOT consume
    assert_render_credit(db, user)

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
