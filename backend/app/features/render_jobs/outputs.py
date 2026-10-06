"""A render job's outputs: where its worker uploads them, and completing the job with them.

Each output lives at customers/<user>/renders/<job>/<name>, under the job's own prefix, by the
name its spec gave it. On cloud storage the worker PUTs it to a URL signed for 15 minutes with
its type, size and download name signed in; local storage signs none, so the worker PUTs it to
this API. Completing checks every output against the spec and against what is stored, then
creates the scene's renders, charges the held credits and counts the bytes toward the owner's
storage, all in one commit.
"""

from __future__ import annotations

import tempfile
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.core.storage.local import LocalBackend
from app.features.billing.quota_service import charge_render_job, count_storage_bytes
from app.features.render_jobs.specs import PlannedOutput, planned_outputs
from app.features.render_jobs.worker import discard_outputs, end_attempt, running_job
from app.models import Render, RenderJob, Scene
from app.schemas.render_job import (
    RenderJobCompleteRequest,
    RenderJobOutputReport,
    RenderJobUpload,
    RenderJobUploadFile,
)

UPLOAD_URL_SECONDS = 900


def _planned(job: RenderJob) -> dict[str, PlannedOutput]:
    return {output.name: output for output in planned_outputs(job.kind, job.spec)}


def _check_type_and_size(field: str, output: PlannedOutput, content_type: str, size: int) -> None:
    if content_type != output.content_type:
        raise HTTPException(status_code=400, detail=f"{field}.content_type: {output.name} is {output.content_type}")
    if size > output.max_bytes:
        raise HTTPException(status_code=400, detail=f"{field}.bytes: at most {output.max_bytes} bytes a file")


def upload_targets(db: Session, job_id: int, token: str, files: list[RenderJobUploadFile]) -> list[RenderJobUpload]:
    """Where to PUT each of the files a running job makes, and the headers to send with it.

    Each file must be one the job's spec names, once, of its type and at most its size cap.
    Asking again signs new URLs, for a PUT that failed or a URL that expired.
    """
    job = running_job(db, job_id, token, lock=False)
    planned = _planned(job)
    if len({file.name for file in files}) != len(files):
        raise HTTPException(status_code=400, detail="files: each name at most once")
    uploads = []
    for index, file in enumerate(files):
        field = f"files[{index}]"
        output = planned.get(file.name)
        if output is None:
            raise HTTPException(status_code=400, detail=f"{field}.name: the job makes no '{file.name}'")
        _check_type_and_size(field, output, file.content_type, file.bytes)
        key = keys.render_job_output_key(job.user_id, job.id, file.name)
        if storage.signs_urls():
            url, headers = storage.presign_upload(
                key, file.content_type, file.bytes, file.name, expires_in=UPLOAD_URL_SECONDS
            )
        else:
            url = f"/render-jobs/{job.id}/uploads/{file.name}"
            headers = {"Content-Type": file.content_type, "Content-Length": str(file.bytes)}
        uploads.append(RenderJobUpload(name=file.name, key=key, url=url, headers=headers))
    return uploads


async def _write_at_most(chunks: AsyncIterator[bytes], limit: int, into: BinaryIO) -> int:
    """Write the body to `into` as it arrives, or 413 as soon as it passes `limit` bytes, and
    return its size. No more than a chunk is held in memory, however large the file."""
    size = 0
    async for chunk in chunks:
        size += len(chunk)
        if size > limit:
            raise HTTPException(status_code=413, detail=f"At most {limit} bytes a file")
        into.write(chunk)
    return size


async def save_local_upload(
    db: Session, job_id: int, token: str, name: str, content_type: str | None, body: AsyncIterator[bytes]
) -> None:
    """Store one output a worker PUTs to the API. Local storage only: on cloud storage outputs
    go straight to the signed URLs, and this is 404."""
    if storage.signs_urls():
        raise HTTPException(status_code=404, detail="Not found")
    job = running_job(db, job_id, token, lock=False)
    output = _planned(job).get(name)
    if output is None:
        raise HTTPException(status_code=404, detail=f"The job makes no '{name}'")
    if content_type != output.content_type:
        raise HTTPException(status_code=400, detail=f"Content-Type: {name} is {output.content_type}")
    backend = storage.get_storage()
    assert isinstance(backend, LocalBackend)  # signs no URLs: local storage
    # Videos and ZIPs run to gigabytes, so the body goes to a staging file, then into place.
    with tempfile.NamedTemporaryFile(dir=backend.staging_dir(), delete=False) as staging:
        staged = Path(staging.name)
        try:
            size = await _write_at_most(body, output.max_bytes, staging)
        except BaseException:
            staging.close()
            staged.unlink(missing_ok=True)
            raise
    if not size:
        staged.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The file is empty")
    backend.put_file(keys.render_job_output_key(job.user_id, job.id, name), staged)


def _check_output(job: RenderJob, field: str, plan: PlannedOutput, output: RenderJobOutputReport) -> None:
    """400 unless the output is the file the spec names, uploaded under the job's prefix, of
    the size it says."""
    prefix = keys.render_job_prefix(job.user_id, job.id)
    expected_key = keys.render_job_output_key(job.user_id, job.id, plan.name)
    if not output.key.startswith(prefix):
        raise HTTPException(status_code=400, detail=f"{field}.key: outside this job's prefix {prefix}")
    if output.key != expected_key:
        raise HTTPException(status_code=400, detail=f"{field}.key: {plan.name} is uploaded to {expected_key}")
    _check_type_and_size(field, plan, output.content_type, output.bytes)
    if (output.width, output.height) != (plan.width, plan.height):
        raise HTTPException(status_code=400, detail=f"{field}: the job renders {plan.width}x{plan.height}")
    if output.label != plan.label:
        raise HTTPException(status_code=400, detail=f"{field}.label: {plan.name} is labelled {plan.label!r}")
    stored = storage.object_size(output.key)
    if stored != output.bytes:
        found = "nothing" if stored is None else f"{stored} bytes"
        raise HTTPException(status_code=400, detail=f"{field}.bytes: {output.bytes} declared, {found} stored")


def _checked_outputs(
    job: RenderJob, reported: list[RenderJobOutputReport]
) -> list[tuple[PlannedOutput, RenderJobOutputReport]]:
    """Each reported output with the file of the spec it is; every one of them, once each."""
    planned = _planned(job)
    if sorted(output.name for output in reported) != sorted(planned):
        raise HTTPException(status_code=400, detail=f"outputs: the job makes {', '.join(planned)}, each once")
    checked = []
    for index, output in enumerate(reported):
        plan = planned[output.name]
        _check_output(job, f"outputs[{index}]", plan, output)
        checked.append((plan, output))
    return checked


def _ended_without_outputs(db: Session, job: RenderJob, code: str, error: str, status_code: int) -> HTTPException:
    """End a job whose outputs can't be kept, refunded, delete them, and the error to answer with."""
    end_attempt(db, job, datetime.utcnow(), code=code, error=error, retryable=False)
    db.commit()
    discard_outputs(job)
    return HTTPException(status_code=status_code, detail=f"{error} The job has ended and its credits were refunded.")


def _render_row(job: RenderJob, scene: Scene, plan: PlannedOutput, output: RenderJobOutputReport, now: datetime) -> Render:
    return Render(
        scene_id=scene.id,
        job_id=job.id,
        key=output.key,
        bytes=output.bytes,
        kind=plan.render_kind,
        material=job.look["material"],
        lighting=job.look["lighting"],
        width=plan.width,
        height=plan.height,
        content_type=plan.content_type,
        filename=plan.name,
        label=plan.label,
        meta=output.meta.model_dump(exclude_none=True) if output.meta else None,
        created_at=now,
    )


def complete_job(db: Session, job_id: int, token: str, body: RenderJobCompleteRequest) -> RenderJob:
    """Complete a running job with its outputs: they become the scene's renders, the held credits
    are charged and the bytes count toward the owner's storage, in one commit.

    An output that isn't what the spec names, under the job's prefix, at the size stored, is 400
    and the job keeps running. A second complete finds the job completed: 409, nothing charged.
    Outputs that can't be kept end the job, refunded: 409 when its scene was deleted, 402 when
    the owner's storage is full.
    """
    job = running_job(db, job_id, token)
    checked = _checked_outputs(job, body.outputs)
    scene = db.get(Scene, job.scene_id) if job.scene_id is not None else None
    if scene is None:
        raise _ended_without_outputs(db, job, "input_missing", "The job's scene was deleted.", 409)
    try:
        count_storage_bytes(db, job.user_id, sum(output.bytes for _, output in checked))
    except HTTPException as exc:
        raise _ended_without_outputs(db, job, "over_limit", exc.detail, exc.status_code) from exc

    now = datetime.utcnow()
    db.add_all(_render_row(job, scene, plan, output, now) for plan, output in checked)
    charge_render_job(db, job)
    job.status = "completed"
    job.progress = 1.0
    job.stage = None
    job.error = None
    job.error_code = None
    job.renderer = body.renderer.model_dump(mode="json")
    job.finished_at = now
    job.updated_at = now
    db.commit()
    db.refresh(job)
    return job
