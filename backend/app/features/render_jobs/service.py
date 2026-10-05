"""Render jobs for users: create, bulk create, quote, list, get, cancel and download.

docs/adr/0005-server-exports.md. A job is validated, priced and its credits held before it
queues. It copies its look and the owner's watermark when it is created, so a retry renders
the same thing whatever changes later.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import storage
from app.features.billing.plans import MAX_BULK_RENDER_JOBS, PLAN_LABELS, PlanTier, get_quotas, normalize_tier
from app.features.billing.quota_service import (
    assert_image_resolution,
    get_or_create_billing,
    hold_render_credits,
    refund_render_job,
)
from app.features.render_jobs.pricing import render_job_cost
from app.features.render_jobs.specs import (
    check_poses,
    normalised_spec,
    output_names,
    output_stem,
    parse_spec,
    spec_warnings,
)
from app.features.scene.look import saved_look, validate_look, variant_look
from app.features.scene.service import require_owned_scene
from app.models import Render, RenderJob, Scene
from app.models.user import User
from app.schemas.render_job import RenderJobCreate, RenderJobOut, RenderJobOutput, RenderJobQuote

MAX_ATTEMPTS = 3
STUDIO_PRIORITY = 100
UNFINISHED = ("queued", "running")
DOWNLOAD_URL_SECONDS = 300
_IDEMPOTENCY_KEY = re.compile(r"[\x21-\x7e]{1,128}")


@dataclass(frozen=True)
class PlannedJob:
    """A create request, validated and priced, ready to queue."""

    scene: Scene
    kind: str
    spec: dict[str, Any]  # normalised, with its frame count and output names
    look: dict[str, Any]
    credits: int
    warnings: list[str]


def _look_to_render(scene: Scene, body: RenderJobCreate) -> dict[str, Any]:
    """The request's look (the studio's current state), else the saved variant's, else the scene's."""
    if body.look is not None:
        return body.look
    if body.variant_id is not None:
        look = variant_look(scene, body.variant_id)
        if look is None:
            raise HTTPException(status_code=404, detail="Variant not found")
        return look
    return saved_look(scene)


def plan_job(db: Session, user: User, body: RenderJobCreate) -> PlannedJob:
    """Validate a create request and price it.

    400 for a bad kind, spec or look; 402 for a size above the plan's cap; 404 for a scene or
    variant that isn't the caller's.
    """
    spec = parse_spec(body.kind, body.spec)
    assert_image_resolution(db, user, spec.width, spec.height)
    scene = require_owned_scene(db.get(Scene, body.scene_id), user.id)
    look = validate_look(db, _look_to_render(scene, body), user.id)
    check_poses(spec, {pose["id"] for pose in look["scene_settings"].get("poses") or []})
    names = output_names(spec, output_stem(body.name, scene.sku, scene.name))
    return PlannedJob(
        scene=scene,
        kind=body.kind,
        spec=normalised_spec(spec, names),
        look=look,
        credits=render_job_cost(body.kind, spec),
        warnings=spec_warnings(spec),
    )


def _assert_queue_room(db: Session, user_id: int, adding: int, tier: PlanTier) -> None:
    """429 when `adding` more jobs would pass the plan's cap on unfinished jobs."""
    cap = get_quotas(tier).max_queued_jobs
    unfinished = db.execute(
        select(func.count())
        .select_from(RenderJob)
        .where(RenderJob.user_id == user_id, RenderJob.status.in_(UNFINISHED))
    ).scalar_one()
    if unfinished + adding > cap:
        raise HTTPException(
            status_code=429,
            detail=f"Render queue full: {PLAN_LABELS[tier]} keeps up to {cap} exports waiting or rendering.",
        )


def _queue_jobs(
    db: Session,
    user: User,
    planned: list[PlannedJob],
    *,
    idempotency_key: str | None = None,
    request_hash: str | None = None,
) -> list[RenderJob]:
    """Hold the planned jobs' credits in one statement and queue them, all or none.

    The hold locks the owner's billing row until the commit, so the queue count after it
    sees every job another request queued meanwhile.
    """
    tier = normalize_tier(get_or_create_billing(db, user).plan_tier)
    quotas = get_quotas(tier)
    now = datetime.utcnow()
    try:
        period_start = hold_render_credits(db, user.id, sum(job.credits for job in planned))
        _assert_queue_room(db, user.id, len(planned), tier)
        jobs = [
            RenderJob(
                user_id=user.id,
                scene_id=job.scene.id,
                kind=job.kind,
                spec=job.spec,
                look=job.look,
                watermark=quotas.watermark_exports,
                priority=STUDIO_PRIORITY,
                max_running=quotas.max_running_jobs,
                max_attempts=MAX_ATTEMPTS,
                credits=job.credits,
                credit_state="held",
                billing_period_start=period_start,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                # What the worker protocol before A2 reads.
                model_ref=job.scene.model_key,
                lighting=job.look["lighting"],
                preset=job.look["material"],
                width=job.spec["width"],
                height=job.spec["height"],
                status="queued",
                attempts=0,
                created_at=now,
                updated_at=now,
            )
            for job in planned
        ]
        db.add_all(jobs)
        db.commit()
    except Exception:
        db.rollback()
        raise
    for job in jobs:
        db.refresh(job)
    return jobs


def _request_hash(body: RenderJobCreate) -> str:
    """SHA-256 of the request as canonical JSON, so the same body hashes the same however it is written."""
    canonical = json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _job_for_key(db: Session, user_id: int, key: str, request_hash: str) -> RenderJob | None:
    """The job an earlier request with this key made; 409 when that request had another body."""
    job = db.execute(
        select(RenderJob).where(RenderJob.user_id == user_id, RenderJob.idempotency_key == key)
    ).scalars().first()
    if job is not None and job.request_hash != request_hash:
        raise HTTPException(status_code=409, detail="Idempotency-Key was already used for another request")
    return job


def create_job(
    db: Session, user: User, body: RenderJobCreate, idempotency_key: str | None = None
) -> tuple[RenderJob, bool]:
    """Queue one job and say whether it is new.

    With an Idempotency-Key, an earlier job made with the same key and body comes back
    instead of a new one, and the same key with another body is 409.
    """
    if idempotency_key is not None and not _IDEMPOTENCY_KEY.fullmatch(idempotency_key):
        raise HTTPException(status_code=400, detail="Idempotency-Key: 1 to 128 visible ASCII characters")
    request_hash = _request_hash(body) if idempotency_key else None
    if idempotency_key and (earlier := _job_for_key(db, user.id, idempotency_key, request_hash)):
        return earlier, False

    planned = plan_job(db, user, body)
    try:
        [job] = _queue_jobs(db, user, [planned], idempotency_key=idempotency_key, request_hash=request_hash)
    except IntegrityError:
        # A request with the same key queued its job first; this one held nothing.
        earlier = _job_for_key(db, user.id, idempotency_key, request_hash) if idempotency_key else None
        if earlier is None:
            raise
        return earlier, False
    return job, True


def create_jobs(
    db: Session, user: User, bodies: list[RenderJobCreate], idempotency_key: str | None = None
) -> list[RenderJob]:
    """Queue jobs for several scenes or variants at once (Grow and Studio): all of them, or none."""
    if idempotency_key is not None:
        raise HTTPException(status_code=400, detail="Idempotency-Key: /render-jobs/bulk doesn't take one")
    if len(bodies) > MAX_BULK_RENDER_JOBS:
        raise HTTPException(status_code=400, detail=f"jobs: at most {MAX_BULK_RENDER_JOBS} a request")
    tier = normalize_tier(get_or_create_billing(db, user).plan_tier)
    if not get_quotas(tier).batch_export:
        raise HTTPException(
            status_code=402,
            detail=f"Rendering several scenes or variants at once is part of Grow and Studio, not {PLAN_LABELS[tier]}.",
        )
    planned: list[PlannedJob] = []
    for index, body in enumerate(bodies):
        try:
            planned.append(plan_job(db, user, body))
        except HTTPException as exc:
            raise HTTPException(status_code=exc.status_code, detail=f"jobs[{index}]: {exc.detail}") from exc
    return _queue_jobs(db, user, planned)


def quote_job(db: Session, user: User, body: RenderJobCreate) -> RenderJobQuote:
    """What a create request would cost and make; nothing is held or queued."""
    planned = plan_job(db, user, body)
    billing = get_or_create_billing(db, user)
    warnings = list(planned.warnings)
    if billing.render_credits_balance < planned.credits:
        warnings.append(
            f"This needs {planned.credits} render credits and {billing.render_credits_balance} are left."
        )
    return RenderJobQuote(
        credits=planned.credits,
        width=planned.spec["width"],
        height=planned.spec["height"],
        frames=planned.spec["frames"],
        output_names=planned.spec["output_names"],
        watermark=get_quotas(normalize_tier(billing.plan_tier)).watermark_exports,
        warnings=warnings,
    )


def get_job_for_user(db: Session, user: User, job_id: int) -> RenderJob:
    """Return job if owned by user, else 404."""
    job = db.get(RenderJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Render job not found")
    return job


def list_jobs(
    db: Session,
    user: User,
    *,
    scene_id: int | None = None,
    batch_id: int | None = None,
    kind: str | None = None,
    status: str | None = None,
    before: int | None = None,
    limit: int = 50,
) -> tuple[list[RenderJob], int | None]:
    """The caller's jobs, newest first, and the `before` that pages on (None on the last page)."""
    filters = [RenderJob.user_id == user.id]
    for column, value in (
        (RenderJob.scene_id, scene_id),
        (RenderJob.batch_id, batch_id),
        (RenderJob.kind, kind),
        (RenderJob.status, status),
    ):
        if value is not None:
            filters.append(column == value)
    if before is not None:
        filters.append(RenderJob.id < before)
    jobs = list(
        db.execute(select(RenderJob).where(*filters).order_by(RenderJob.id.desc()).limit(limit + 1)).scalars()
    )
    next_before = jobs[limit - 1].id if len(jobs) > limit else None
    return jobs[:limit], next_before


def _update_job(db: Session, job_id: int, condition: Any, **values: Any) -> bool:
    """One conditional UPDATE of a job; whether it matched."""
    result = db.execute(
        update(RenderJob)
        .where(RenderJob.id == job_id, condition)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def cancel_job(db: Session, user: User, job_id: int) -> RenderJob:
    """Cancel a job: a queued one at once, refunded; a running one when its worker stops.

    Each step is a conditional UPDATE, so a worker claiming or finishing the job meanwhile is
    never overwritten. A finished job is 409.
    """
    job = get_job_for_user(db, user, job_id)
    now = datetime.utcnow()
    if _update_job(db, job.id, RenderJob.status == "queued", status="canceled", finished_at=now, updated_at=now):
        refund_render_job(db, job)
    elif not _update_job(
        db,
        job.id,
        RenderJob.status == "running",
        cancel_requested_at=func.coalesce(RenderJob.cancel_requested_at, now),
        updated_at=now,
    ):
        db.rollback()
        db.refresh(job)
        raise HTTPException(status_code=409, detail=f"Job is already {job.status}")
    db.commit()
    db.refresh(job)
    return job


def download_output(db: Session, user: User, job_id: int, render_id: int) -> FileResponse | RedirectResponse:
    """One of a job's outputs: a redirect to a signed URL that lives 300 s.

    Local storage signs no URLs, so the API streams the file itself.
    """
    job = get_job_for_user(db, user, job_id)
    output = db.execute(
        select(Render).where(Render.id == render_id, Render.job_id == job.id)
    ).scalars().first()
    if output is None:
        raise HTTPException(status_code=404, detail="Output not found")
    local = storage.local_file_if_exists(output.key)
    if local is not None:
        return FileResponse(local, media_type=output.content_type, filename=output.filename or local.name)
    return RedirectResponse(storage.presign_get(output.key, expires_in=DOWNLOAD_URL_SECONDS), status_code=302)


def job_views(db: Session, jobs: list[RenderJob]) -> list[RenderJobOut]:
    """Jobs as the user endpoints return them, with their outputs, read in one query."""
    outputs: dict[int, list[RenderJobOutput]] = {}
    if jobs:
        rows = db.execute(
            select(Render).where(Render.job_id.in_([job.id for job in jobs])).order_by(Render.id)
        ).scalars()
        for row in rows:
            outputs.setdefault(row.job_id, []).append(RenderJobOutput.model_validate(row))
    return [
        RenderJobOut.model_validate(job).model_copy(update={"outputs": outputs.get(job.id, [])})
        for job in jobs
    ]


def job_view(db: Session, job: RenderJob) -> RenderJobOut:
    return job_views(db, [job])[0]
