"""A converted design's renders (docs/adr/0006-bulk-pipeline.md, "Render plans" and "Credits for a
batch").

Once a design's scene is made, its batch's render plan becomes ADR 0005 render jobs on the scene's
saved look, so whatever look the scene was made with (a look template's, F1) is the look they
render: an angle set, a turntable and a spin, as the plan asks, for the scene, the batch and the
design, behind the studio's jobs. The render credits the design holds move onto them, each with
its share of the bought ones and the allowance generation they were held in, so they charge or
refund as every job does, and the design costs what its jobs charge. A retry makes new jobs for
the parts that didn't complete, from credits held again.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.billing.credit_pools import split_bought
from app.features.billing.plans import PlanQuotas, get_quotas, normalize_tier
from app.features.ingest.items import current_render_jobs, locked_items, release_held_credits
from app.features.ingest.render_plans import PlannedRender, planned_renders
from app.features.render_jobs.job_files import normalised_spec, output_names, output_stem
from app.features.scene.look import saved_look, validate_look
from app.models import IngestBatch, IngestItem, RenderJob, Scene, UserBilling

# A batch's jobs wait behind the studio's (100), and get as many attempts.
BATCH_PRIORITY = 10
MAX_ATTEMPTS = 3
MAX_ERROR_LENGTH = 1024


def share_held(total: int, costs: Sequence[int]) -> list[int]:
    """`total` held credits shared over jobs of these costs: each its own cost while they add up
    to it, as they do unless prices changed since the batch was priced; else in proportion, the
    first jobs taking what rounding leaves. The shares add up to `total`, so the jobs charge what
    was held for them."""
    whole = sum(costs)
    if whole == total:
        return list(costs)
    if whole == 0:
        return [total, *([0] * (len(costs) - 1))]
    shares = [total * cost // whole for cost in costs]
    for index in range(total - sum(shares)):
        shares[index] += 1
    return shares


def renders_to_run(db: Session, batch: IngestBatch, item_id: int) -> list[PlannedRender]:
    """The jobs of the batch's plan a design hasn't completed: all of them at first, then those a
    retry renders again."""
    completed = {job.kind for job in current_render_jobs(db, item_id) if job.status == "completed"}
    return [planned for planned in planned_renders(batch.render_plan or {}) if planned.kind not in completed]


def _owner_quotas(db: Session, user_id: int) -> PlanQuotas:
    tier = db.execute(select(UserBilling.plan_tier).where(UserBilling.user_id == user_id)).scalar_one_or_none()
    return get_quotas(normalize_tier(tier))


def _fail_rendering(db: Session, item: IngestItem, error: str, now: datetime) -> None:
    """A design whose plan can't be rendered fails, and gets back the credits it holds."""
    item.status = "failed"
    item.error = error[:MAX_ERROR_LENGTH]
    item.error_code = "invalid_spec"
    item.updated_at = now
    db.flush()
    release_held_credits(db, [item.id])


def _job(item: IngestItem, scene: Scene, planned: PlannedRender, look: dict, quotas: PlanQuotas, now: datetime) -> RenderJob:
    names = output_names(planned.spec, output_stem(None, scene.sku, scene.name))
    return RenderJob(
        user_id=item.user_id,
        scene_id=scene.id,
        batch_id=item.batch_id,
        ingest_item_id=item.id,
        kind=planned.kind,
        spec=normalised_spec(planned.spec, names),
        look=look,
        watermark=quotas.watermark_exports,
        priority=BATCH_PRIORITY,
        max_running=quotas.max_running_jobs,
        max_attempts=MAX_ATTEMPTS,
        credits=0,  # its share of what the design holds, set by the caller
        credit_state="held",
        billing_period_start=item.credits_period_start,
        billing_allowance_generation=item.credits_allowance_generation,
        status="queued",
        attempts=0,
        created_at=now,
        updated_at=now,
    )


def queue_design_renders(db: Session, batch: IngestBatch, item: IngestItem, scene: Scene, now: datetime) -> None:
    """Queue the jobs of the plan `item` hasn't completed, on its scene's saved look, and move the
    render credits it holds onto them: the design renders, holding nothing itself. A look or a
    plan that can't be rendered fails the design instead, its credits given back. The caller has
    locked the design. Not committed."""
    try:
        renders = renders_to_run(db, batch, item.id)
        look = validate_look(db, saved_look(scene), item.user_id)
    except HTTPException as exc:
        _fail_rendering(db, item, f"The design's renders can't be made: {exc.detail}", now)
        return
    item.error = None
    item.error_code = None
    item.updated_at = now
    if not renders:  # every part has completed already: nothing to hold credits for
        item.status = "done"
        db.flush()
        release_held_credits(db, [item.id])
        return
    quotas = _owner_quotas(db, item.user_id)
    jobs = [_job(item, scene, planned, look, quotas, now) for planned in renders]
    credits = share_held(item.render_credits_held, [planned.credits for planned in renders])
    bought = split_bought(credits, item.bought_render_credits_held)
    for job, job_credits, job_bought in zip(jobs, credits, bought, strict=True):
        job.credits = job_credits
        job.bought_credits = job_bought
    db.add_all(jobs)
    item.status = "rendering"
    item.render_credits_held = 0
    item.bought_render_credits_held = 0
    db.flush()


def render_converted_design(db: Session, item_id: int, scene: Scene) -> None:
    """A design whose scene was just made, in this transaction, starts rendering its batch's
    plan. Once only: it must still be converted, so a conversion's completion arriving twice
    can't queue its jobs twice. Not committed."""
    [item] = locked_items(db, IngestItem.id == item_id)  # the conversion's own update holds it already
    if item.status != "converted":
        return
    queue_design_renders(db, db.get(IngestBatch, item.batch_id), item, scene, datetime.utcnow())
