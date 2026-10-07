"""How far a batch's designs and their render jobs have got, read for the batch's pages in a few
queries however many designs there are (docs/adr/0006-bulk-pipeline.md, "The batch page").

Each design shows its render jobs (the newest of each kind, with what they made) and its scene's
thumbnail; each batch the credits its jobs hold, charged and gave back, beside what its designs
hold and were given back themselves.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.ingest.items import newest_of_each_kind
from app.features.scene.service import scene_thumbnail_url
from app.models import IngestItem, Render, RenderJob, Scene
from app.schemas.ingest import IngestItemJob
from app.schemas.render_job import RenderJobOutput


@dataclass
class DesignRenders:
    jobs: list[IngestItemJob] = field(default_factory=list)
    thumbnail_url: str | None = None


@dataclass
class BatchJobCredits:
    """Render credits a batch's jobs hold, have charged and gave back; and the model credits its
    completed conversions spent, a scene each."""

    held: int = 0
    charged: int = 0
    refunded: int = 0
    scenes_made: int = 0


def design_renders(db: Session, items: Collection[IngestItem]) -> dict[int, DesignRenders]:
    """Each design's render jobs and its scene's thumbnail, by the design's id."""
    found: dict[int, DesignRenders] = {item.id: DesignRenders() for item in items}
    if not items:
        return found
    rows = db.execute(
        select(RenderJob).where(RenderJob.ingest_item_id.in_(list(found)), RenderJob.kind != "convert")
    ).scalars()
    by_design: dict[int, list[RenderJob]] = defaultdict(list)
    for job in rows:
        by_design[job.ingest_item_id].append(job)
    jobs = {item_id: newest_of_each_kind(design_jobs) for item_id, design_jobs in by_design.items()}
    outputs: dict[int, list[RenderJobOutput]] = defaultdict(list)
    job_ids = [job.id for design_jobs in jobs.values() for job in design_jobs]
    if job_ids:
        for render in db.execute(select(Render).where(Render.job_id.in_(job_ids)).order_by(Render.id)).scalars():
            outputs[render.job_id].append(RenderJobOutput.model_validate(render))
    for item_id, design_jobs in jobs.items():
        found[item_id].jobs = [
            IngestItemJob.model_validate(job).model_copy(update={"outputs": outputs[job.id]}) for job in design_jobs
        ]
    scene_ids = {item.scene_id for item in items if item.scene_id is not None}
    scenes = {scene.id: scene for scene in db.execute(select(Scene).where(Scene.id.in_(scene_ids))).scalars()} if scene_ids else {}
    for item in items:
        if (scene := scenes.get(item.scene_id)) is not None:
            found[item.id].thumbnail_url = scene_thumbnail_url(scene)
    return found


def batch_job_credits(db: Session, batch_ids: Collection[int]) -> dict[int, BatchJobCredits]:
    """What each batch's jobs come to, by the batch's id: render credits by where they are now,
    and the conversions that made a scene."""
    found: dict[int, BatchJobCredits] = {batch_id: BatchJobCredits() for batch_id in batch_ids}
    if not batch_ids:
        return found
    credits = db.execute(
        select(RenderJob.batch_id, RenderJob.credit_state, func.sum(RenderJob.credits))
        .where(RenderJob.batch_id.in_(list(batch_ids)), RenderJob.kind != "convert")
        .group_by(RenderJob.batch_id, RenderJob.credit_state)
    ).all()
    for batch_id, state, total in credits:
        if state in ("held", "charged", "refunded"):
            setattr(found[batch_id], state, total or 0)
    conversions = db.execute(
        select(RenderJob.batch_id, func.count())
        .where(RenderJob.batch_id.in_(list(batch_ids)), RenderJob.kind == "convert", RenderJob.status == "completed")
        .group_by(RenderJob.batch_id)
    ).all()
    for batch_id, count in conversions:
        found[batch_id].scenes_made = count
    return found
