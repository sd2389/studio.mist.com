"""What a worker renders a job from: its payload, and on local storage the files it names.

The payload is what the harness's export mode reads (src/features/render/harness/job-payload.ts):
the spec, the look frozen at creation with the items it names, where to get the model, the
watermark and the limits. On cloud storage the model and a background image come as URLs signed
for 15 minutes; local storage signs none, so the payload names this API's routes for them, which
take the job's token like every other worker call. A convert job's payload is its spec and its
design's CAD files, fetched the same ways (ADR 0006).
"""

from __future__ import annotations

import copy
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core import storage
from app.features.render_jobs.job_files import longest_edge
from app.features.render_jobs.worker import discard_outputs, end_attempt, max_runtime_seconds, running_job
from app.features.scene.look import background_image_key, scene_look
from app.models import RenderJob, Scene
from app.schemas.render_job import (
    ConvertJobPayload,
    ModelPath,
    ModelURL,
    PayloadLimits,
    PayloadScene,
    RenderJobPayload,
)

INPUT_URL_SECONDS = 900


def _missing_input(db: Session, job: RenderJob, error: str) -> HTTPException:
    """End a job whose input is gone, refunded, since no attempt can render it; and the 409
    the worker gets."""
    end_attempt(db, job, datetime.utcnow(), code="input_missing", error=error, retryable=False)
    db.commit()
    discard_outputs(job)
    return HTTPException(status_code=409, detail=f"{error} The job has ended and its credits were refunded.")


def _job_scene(db: Session, job: RenderJob) -> Scene | None:
    return db.get(Scene, job.scene_id) if job.scene_id is not None else None


def _background_asset_id(job: RenderJob) -> int | None:
    """The look's background image, by asset id; None for a colour, a gradient or a catalogue backdrop."""
    background = job.look["scene_settings"].get("customBackground")
    return background["asset_id"] if isinstance(background, dict) else None


def _look_for_harness(db: Session, job: RenderJob) -> dict[str, Any]:
    """The job's look as the harness draws it. A background image, kept by its asset id, becomes
    the URL to fetch it from, since the harness draws `customBackground` as a CSS url(). The
    job keeps the id. An image that is no longer the owner's ends the job (409)."""
    look = copy.deepcopy(job.look)
    asset_id = _background_asset_id(job)
    if asset_id is None:
        return look
    key = background_image_key(db, job.user_id, asset_id)
    if key is None:
        raise _missing_input(db, job, "The look's background image is no longer one of the owner's.")
    look["scene_settings"]["customBackground"] = (
        storage.presign_get(key, expires_in=INPUT_URL_SECONDS)
        if storage.signs_urls()
        else f"/render-jobs/{job.id}/inputs/background"
    )
    return look


def _model_source(job: RenderJob, scene: Scene) -> ModelURL | ModelPath:
    if storage.signs_urls():
        return ModelURL(url=storage.presign_get(scene.model_key, expires_in=INPUT_URL_SECONDS))
    return ModelPath(path=f"/render-jobs/{job.id}/inputs/model")


def _input_location(job: RenderJob, key: str, route: str) -> ModelURL | ModelPath:
    if storage.signs_urls():
        return ModelURL(url=storage.presign_get(key, expires_in=INPUT_URL_SECONDS))
    return ModelPath(path=f"/render-jobs/{job.id}/inputs/{route}")


def _convert_payload(job: RenderJob) -> ConvertJobPayload:
    """What a convert job converts: its spec, and its design's source file and companions."""
    spec = job.spec
    return ConvertJobPayload(
        kind="convert",
        spec=spec,
        source=_input_location(job, spec["source"]["key"], "source"),
        companions=[
            _input_location(job, companion["key"], f"companions/{index}")
            for index, companion in enumerate(spec["companions"])
        ],
        limits=PayloadLimits(max_edge=spec["thumbnail"]["size"], max_runtime_seconds=max_runtime_seconds(job.kind)),
    )


def job_payload(db: Session, job_id: int, token: str) -> RenderJobPayload | ConvertJobPayload:
    """The running job's payload. A job whose scene or background image has gone since it was
    created can't render: it ends failed (input_missing) and refunded, and this is 409. A
    convert job's is its design's files (ADR 0006)."""
    job = running_job(db, job_id, token)
    if job.kind == "convert":
        payload = _convert_payload(job)
        db.commit()  # ends the read and its row lock
        return payload
    scene = _job_scene(db, job)
    if scene is None:
        raise _missing_input(db, job, "The job's scene was deleted.")
    payload = RenderJobPayload(
        kind=job.kind,
        spec=job.spec,
        look=_look_for_harness(db, job),
        look_items=scene_look(db, job.look, job.user_id),
        model=_model_source(job, scene),
        watermark=job.watermark,
        limits=PayloadLimits(
            max_edge=longest_edge(job.kind, job.spec), max_runtime_seconds=max_runtime_seconds(job.kind)
        ),
        scene=PayloadScene(id=scene.id, name=scene.name, sku=scene.sku),
    )
    db.commit()  # ends the read and its row lock
    return payload


def _local_file(key: str | None, media_type: str | None = None) -> FileResponse:
    """A stored file streamed by the API: local storage only, where the payload names these routes."""
    path = storage.local_file_if_exists(key) if key else None
    if path is None:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type=media_type)


def model_file(db: Session, job_id: int, token: str) -> FileResponse:
    job = running_job(db, job_id, token, lock=False)
    scene = _job_scene(db, job)
    return _local_file(scene.model_key if scene else None, media_type="model/gltf-binary")


def background_file(db: Session, job_id: int, token: str) -> FileResponse:
    job = running_job(db, job_id, token, lock=False)
    asset_id = _background_asset_id(job)
    return _local_file(background_image_key(db, job.user_id, asset_id) if asset_id is not None else None)


def convert_source_file(db: Session, job_id: int, token: str) -> FileResponse:
    """A convert job's CAD file (local storage only)."""
    job = running_job(db, job_id, token, lock=False)
    return _local_file(job.spec["source"]["key"] if job.kind == "convert" else None)


def convert_companion_file(db: Session, job_id: int, token: str, index: int) -> FileResponse:
    """One of a convert job's companion files, by its place in the spec (local storage only)."""
    job = running_job(db, job_id, token, lock=False)
    companions = job.spec["companions"] if job.kind == "convert" else []
    return _local_file(companions[index]["key"] if 0 <= index < len(companions) else None)
