"""What each design of a batch made, as its manifest lists it and its archive holds it
(docs/adr/0006-bulk-pipeline.md, "Results").

A design's files are the outputs of its render jobs that count (the newest of each kind, so a
retry's stand in for the ones it rendered again) and its scene's thumbnail. Each has a place in
the manifest (a column) and in the archive (a path under the design's SKU), and a link: its
public copy when the batch publishes media, else the studio's own download link, which only its
signed-in owner can open.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.public_urls import public_file_url, published_scene_thumbnail_url
from app.features.ingest.items import newest_of_each_kind
from app.models import IngestBatch, IngestItem, Render, RenderJob, Scene

# The kinds a render plan makes, in the order a design lists them.
_KIND_ORDER = {"angle_set": 0, "turntable": 1, "spin": 2}
# Where each kind's file goes in the archive, under the design's SKU, and its manifest column.
TURNTABLE_COLUMN = "turntable_mp4"
SPIN_COLUMN = "spin_zip"
THUMBNAIL_COLUMN = "thumbnail"


def still_column(angle: str) -> str:
    """`still_three_quarter` for the three-quarter angle's still."""
    return f"still_{angle.replace('-', '_')}"


@dataclass(frozen=True)
class DesignFile:
    """One file a design made: its manifest column (none for a kind the manifest has no column
    for), its path in the archive, where it is stored and its size when known, and its link."""

    column: str | None
    path: str
    key: str
    bytes: int | None  # a thumbnail's isn't recorded
    link: str | None
    render_id: int | None = None  # an output's
    scene_id: int | None = None  # a thumbnail's, its scene's


@dataclass
class DesignResult:
    item: IngestItem
    scene: Scene | None
    files: list[DesignFile] = field(default_factory=list)


def _app_link(path: str) -> str:
    return f"{get_settings().app_public_url.rstrip('/')}{path}"


def output_link(render: Render, publish_media: bool) -> str:
    """An output's public copy with publish_media; else the studio's download, for its owner."""
    if publish_media and render.public_key and (url := public_file_url(render.public_key)):
        return url
    return _app_link(f"/api/render-jobs/{render.job_id}/outputs/{render.id}/download")


def thumbnail_link(scene: Scene, publish_media: bool) -> str | None:
    """The published thumbnail with publish_media; else the studio's link to the private one,
    which checks its owner (/api/files/…)."""
    if publish_media and scene.sku and scene.published_at is not None:
        if url := published_scene_thumbnail_url(scene.user_id, scene.sku):
            return url
    return public_file_url(scene.thumbnail_key) if scene.thumbnail_key else None


def _extension(name: str | None, fallback: str) -> str:
    return PurePosixPath(name or "").suffix.lower() or fallback


def _output_file(sku: str, render: Render, job_kind: str, publish_media: bool) -> DesignFile:
    link = output_link(render, publish_media)
    if job_kind == "angle_set" and render.label:
        name = f"{render.label}{_extension(render.filename, '.jpg')}"
        return DesignFile(still_column(render.label), f"{sku}/stills/{name}", render.key, render.bytes, link, render.id)
    if job_kind == "turntable":
        return DesignFile(TURNTABLE_COLUMN, f"{sku}/video/turntable.mp4", render.key, render.bytes, link, render.id)
    if job_kind == "spin":
        return DesignFile(SPIN_COLUMN, f"{sku}/spin/spin.zip", render.key, render.bytes, link, render.id)
    name = render.filename or PurePosixPath(render.key).name
    return DesignFile(None, f"{sku}/{name}", render.key, render.bytes, link, render.id)


def _thumbnail_file(sku: str, scene: Scene, publish_media: bool) -> DesignFile:
    path = f"{sku}/thumbnail{_extension(scene.thumbnail_key, '.webp')}"
    link = thumbnail_link(scene, publish_media)
    return DesignFile(THUMBNAIL_COLUMN, path, scene.thumbnail_key, None, link, scene_id=scene.id)


def _current_outputs(db: Session, batch_id: int) -> dict[int, list[tuple[RenderJob, Render]]]:
    """Each design's outputs, by the design's id: those of its render jobs that count, in kind
    order, then as they were made."""
    jobs: dict[int, list[RenderJob]] = defaultdict(list)
    for job in db.execute(
        select(RenderJob).where(
            RenderJob.batch_id == batch_id,
            RenderJob.ingest_item_id.is_not(None),
            RenderJob.kind.in_(list(_KIND_ORDER)),
        )
    ).scalars():
        jobs[job.ingest_item_id].append(job)
    counted = {job.id: job for design_jobs in jobs.values() for job in newest_of_each_kind(design_jobs)}
    outputs: dict[int, list[tuple[RenderJob, Render]]] = defaultdict(list)
    if not counted:
        return outputs
    renders = db.execute(
        select(Render).join(RenderJob, Render.job_id == RenderJob.id).where(RenderJob.batch_id == batch_id).order_by(Render.id)
    ).scalars()
    for render in renders:
        if (job := counted.get(render.job_id)) is not None:
            outputs[job.ingest_item_id].append((job, render))
    for design_outputs in outputs.values():
        design_outputs.sort(key=lambda pair: _KIND_ORDER[pair[0].kind])  # stable: made order within a kind
    return outputs


def design_results(db: Session, batch: IngestBatch) -> list[DesignResult]:
    """Every design of the batch, in the order dropped, with the files it made. A design whose
    scene was deleted keeps nothing: its renders went with the scene."""
    publish_media = bool((batch.render_plan or {}).get("publish_media"))
    items = list(
        db.execute(select(IngestItem).where(IngestItem.batch_id == batch.id).order_by(IngestItem.position, IngestItem.id)).scalars()
    )
    scene_ids = [item.scene_id for item in items if item.scene_id is not None]
    scenes = {scene.id: scene for scene in db.execute(select(Scene).where(Scene.id.in_(scene_ids))).scalars()} if scene_ids else {}
    outputs = _current_outputs(db, batch.id)
    results = []
    for item in items:
        scene = scenes.get(item.scene_id) if item.scene_id is not None else None
        result = DesignResult(item=item, scene=scene)
        if scene is not None:
            if scene.thumbnail_key:
                result.files.append(_thumbnail_file(item.sku, scene, publish_media))
            result.files += [_output_file(item.sku, render, job.kind, publish_media) for job, render in outputs[item.id]]
        results.append(result)
    return results
