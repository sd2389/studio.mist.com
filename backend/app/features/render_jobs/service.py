"""Render jobs for users: create, bulk create, list, get, cancel and download (quotes.py prices them).

docs/adr/0005-server-exports.md. A job is validated, priced and its credits held before it
queues. It copies its look and the owner's watermark when it is created, so a retry renders
the same thing whatever changes later.
"""

from __future__ import annotations

from collections.abc import Callable
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
from app.features.render_jobs import idempotency
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
from app.features.ingest.items import end_item_of_job
from app.models import Render, RenderJob, Scene
from app.models.user import User
from app.schemas.render_job import RenderJobBulkCreate, RenderJobCreate, RenderJobOut, RenderJobOutput

MAX_ATTEMPTS = 3
STUDIO_PRIORITY = 100
UNFINISHED = ("queued", "running")
DOWNLOAD_URL_SECONDS = 300


@dataclass(frozen=True)
class PlannedJob:
    """A create request, validated and priced, ready to queue."""

    scene: Scene
    kind: str
    spec: dict[str, Any]  # normalised, with its frame count and output names
    look: dict[str, Any]
    credits: int
    warnings: list[str]
    # What else the request named, kept on the job so the same job can be asked for again.
    variant_id: str | None
    name: str | None


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
        variant_id=body.variant_id,
        name=body.name,
    )


def _assert_queue_room(db: Session, user_id: int, adding: int, tier: PlanTier) -> None:
    """429 when `adding` more jobs would pass the plan's cap on unfinished jobs from the studio.
    A bulk upload's jobs don't count: its own limits bound them (ADR 0006)."""
    cap = get_quotas(tier).max_queued_jobs
    unfinished = db.execute(
        select(func.count())
        .select_from(RenderJob)
        .where(RenderJob.user_id == user_id, RenderJob.status.in_(UNFINISHED), RenderJob.batch_id.is_(None))
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
    idempotency_keys: list[str] | None = None,
    request_hash: str | None = None,
) -> list[RenderJob]:
    """Hold the planned jobs' credits in one statement and queue them, all or none.

    The hold locks the owner's billing row until the commit, so the queue count after it
    sees every job another request queued meanwhile.
    """
    tier = normalize_tier(get_or_create_billing(db, user).plan_tier)
    quotas = get_quotas(tier)
    now = datetime.utcnow()
    keys = idempotency_keys or [None] * len(planned)
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
                variant_id=job.variant_id,
                name=job.name,
                watermark=quotas.watermark_exports,
                priority=STUDIO_PRIORITY,
                max_running=quotas.max_running_jobs,
                max_attempts=MAX_ATTEMPTS,
                credits=job.credits,
                credit_state="held",
                billing_period_start=period_start,
                idempotency_key=key,
                request_hash=request_hash,
                status="queued",
                attempts=0,
                created_at=now,
                updated_at=now,
            )
            for job, key in zip(planned, keys, strict=True)
        ]
        db.add_all(jobs)
        db.commit()
    except Exception:
        db.rollback()
        raise
    for job in jobs:
        db.refresh(job)
    return jobs


def _queue_once(
    db: Session,
    user: User,
    plan: Callable[[], list[PlannedJob]],
    key: str | None,
    body: RenderJobCreate | RenderJobBulkCreate,
) -> tuple[list[RenderJob], bool]:
    """Queue the jobs `plan` makes, and say they are new. With an Idempotency-Key an earlier
    request used with the same body, that request's jobs come back instead, planned and held
    nothing; the same key with another body is 409."""
    idempotency.check_key(key)
    if key is None:
        return _queue_jobs(db, user, plan()), True
    bulk = isinstance(body, RenderJobBulkCreate)
    body_hash = idempotency.request_hash(body)
    if earlier := idempotency.earlier_jobs(db, user.id, key, body_hash, bulk=bulk):
        return earlier, False
    planned = plan()
    keys = idempotency.bulk_job_keys(key, len(planned)) if bulk else [key]
    try:
        return _queue_jobs(db, user, planned, idempotency_keys=keys, request_hash=body_hash), True
    except IntegrityError:
        # A request with the same key queued its jobs first; this one held nothing.
        earlier = idempotency.earlier_jobs(db, user.id, key, body_hash, bulk=bulk)
        if not earlier:
            raise
        return earlier, False


def create_job(
    db: Session, user: User, body: RenderJobCreate, idempotency_key: str | None = None
) -> tuple[RenderJob, bool]:
    """Queue one job and say whether it is new (see _queue_once for an Idempotency-Key)."""
    [job], created = _queue_once(db, user, lambda: [plan_job(db, user, body)], idempotency_key, body)
    return job, created


def check_bulk_size(count: int) -> None:
    if count > MAX_BULK_RENDER_JOBS:
        raise HTTPException(status_code=400, detail=f"jobs: at most {MAX_BULK_RENDER_JOBS} a request")


def bulk_refusal(tier: PlanTier) -> str | None:
    """Why the plan can't render several scenes or variants in one request; None when it can."""
    if get_quotas(tier).batch_export:
        return None
    return f"Rendering several scenes or variants at once is part of Grow and Studio, not {PLAN_LABELS[tier]}."


def plan_bulk(db: Session, user: User, bodies: list[RenderJobCreate]) -> list[PlannedJob]:
    """Several create requests at once (Grow and Studio), each validated and priced; 400 or 402
    naming the first one that can't be made."""
    check_bulk_size(len(bodies))
    if refusal := bulk_refusal(normalize_tier(get_or_create_billing(db, user).plan_tier)):
        raise HTTPException(status_code=402, detail=refusal)
    planned: list[PlannedJob] = []
    for index, body in enumerate(bodies):
        try:
            planned.append(plan_job(db, user, body))
        except HTTPException as exc:
            raise HTTPException(status_code=exc.status_code, detail=f"jobs[{index}]: {exc.detail}") from exc
    return planned


def create_jobs(
    db: Session, user: User, body: RenderJobBulkCreate, idempotency_key: str | None = None
) -> tuple[list[RenderJob], bool]:
    """Queue jobs for several scenes or variants at once, all of them or none, and say whether
    they are new (see _queue_once for an Idempotency-Key)."""
    return _queue_once(db, user, lambda: plan_bulk(db, user, body.jobs), idempotency_key, body)


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
        end_item_of_job(db, job, "canceled")
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
