"""What a batch design's completed render job leaves besides its renders (docs/adr/0006-bulk-pipeline.md,
"Render plans").

- The scene's thumbnail: once the angle set completes, a 512 px WebP of the plan's
  `thumbnail_from` still becomes the scene's thumbnail and the scene is published again, so the
  dashboard and the embed show the piece in the look it was rendered in rather than the
  converter's plain thumbnail.
- With `publish_media`, each output is copied to the public bucket beside the scene's published
  model, published/<user>/<sku>/media/<job>/<file>, and its render keeps where. Without it, as by
  default, outputs stay private and download through the API.
- A design that is done has its scene published, if publishing it failed before, so the embed
  link it keeps shows the piece.

Each step runs once the job's completion is committed, and is best effort: one that fails is
logged and leaves the completed job, its charge and its renders as they are.
"""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.observability import get_logger, log_event
from app.features.publish import service as publish_service
from app.features.render_jobs.job_files import MAX_IMAGE_BYTES
from app.features.scene.thumbnail import replace_scene_thumbnail, thumbnail_from_still
from app.models import IngestBatch, IngestItem, Render, RenderJob, Scene, User

_logger = get_logger("studio.ingest")


def _best_effort(db: Session, event: str, job: RenderJob, step: Callable[[], None]) -> None:
    try:
        step()
    except Exception as exc:  # noqa: BLE001 - the job has completed; this only adds to it
        db.rollback()
        log_event(_logger, event, job_id=job.id, scene_id=job.scene_id, error=str(exc))


def _thumbnail_from_still(db: Session, job: RenderJob, scene: Scene, angle: str) -> None:
    """The scene's thumbnail from the angle set's still of `angle`."""
    still = db.execute(select(Render).where(Render.job_id == job.id, Render.label == angle)).scalars().first()
    if still is None:
        return
    image = thumbnail_from_still(storage.read_bytes(still.key, max_bytes=MAX_IMAGE_BYTES))
    replace_scene_thumbnail(db, scene, db.get(User, job.user_id), image)


def _publish_outputs(db: Session, job: RenderJob, scene: Scene) -> None:
    """Each of the job's outputs not yet published, copied beside the scene's published model."""
    renders = list(db.execute(select(Render).where(Render.job_id == job.id, Render.public_key.is_(None))).scalars())
    names = {render.id: render.filename or render.key.rsplit("/", 1)[-1] for render in renders}
    copied = publish_service.publish_job_media(scene, job.id, [(names[render.id], render.key) for render in renders])
    for render in renders:
        render.public_key = copied.get(names[render.id])
    db.commit()


def _publish_scene(db: Session, scene: Scene) -> None:
    if (scene.sku or "").strip() and scene.published_at is None:
        publish_service.publish_scene(db, scene)


def finish_design_render(db: Session, job: RenderJob) -> None:
    """What a design's batch plan asks of one of its jobs once it has completed (see above)."""
    item = db.get(IngestItem, job.ingest_item_id) if job.ingest_item_id is not None else None
    batch = db.get(IngestBatch, item.batch_id) if item is not None else None
    scene = db.get(Scene, job.scene_id) if job.scene_id is not None else None
    if item is None or batch is None or scene is None or not batch.render_plan:
        return
    plan = batch.render_plan
    if job.kind == "angle_set" and plan.get("thumbnail_from"):
        _best_effort(db, "ingest.thumbnail_failed", job, lambda: _thumbnail_from_still(db, job, scene, plan["thumbnail_from"]))
    if plan.get("publish_media") and item.status != "canceled":
        _best_effort(db, "ingest.media_failed", job, lambda: _publish_outputs(db, job, scene))
    if item.status == "done":
        _best_effort(db, "ingest.publish_failed", job, lambda: _publish_scene(db, scene))
