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
from app.features.render_jobs.job_files import PlannedOutput, planned_outputs
from app.features.render_jobs.worker import discard_outputs, end_attempt, mark_completed, running_job
from app.features.render_jobs.archive_spec import ARCHIVE_KIND, archive_outputs, archive_part_names
from app.features.render_jobs.convert_spec import OPTIONAL_OUTPUTS as OPTIONAL_CONVERT_OUTPUTS
from app.features.render_jobs.convert_spec import convert_outputs
from app.features.ingest.archive import ArchiveRefused, complete_archive
from app.features.ingest.deletions import drain_deletions
from app.features.ingest.conversions import complete_conversion
from app.features.ingest.items import end_item_of_job, lock_design_of
from app.features.ingest.media import finish_design_render
from app.models import Render, RenderJob, Scene
from app.schemas.render_job import (
    RenderJobCompleteRequest,
    RenderJobOutputReport,
    RenderJobUpload,
    RenderJobUploadFile,
)

UPLOAD_URL_SECONDS = 900


def _planned(job: RenderJob) -> dict[str, PlannedOutput]:
    if job.kind == "convert":
        outputs = convert_outputs(job.spec)
    elif job.kind == ARCHIVE_KIND:
        outputs = archive_outputs(job.spec)
    else:
        outputs = planned_outputs(job.kind, job.spec)
    return {output.name: output for output in outputs}


def _optional(job: RenderJob) -> frozenset[str]:
    """The files a job may leave out: a convert job's thumbnail, an archive's parts after its first."""
    if job.kind == "convert":
        return OPTIONAL_CONVERT_OUTPUTS
    if job.kind == ARCHIVE_KIND:
        return frozenset(archive_part_names(job.spec)[1:])
    return frozenset()


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
    """Each reported output with the file of the spec it is; every one the job must make, and
    each at most once."""
    planned, optional = _planned(job), _optional(job)
    names = [output.name for output in reported]
    if len(set(names)) != len(names) or not set(planned) - optional <= set(names) <= set(planned):
        required = ", ".join(name for name in planned if name not in optional)
        may_make = f", and may make {', '.join(sorted(optional))}" if optional else ""
        raise HTTPException(status_code=400, detail=f"outputs: the job makes {required}, each once{may_make}")
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
    the owner's storage is full. A convert job's files make its design's scene instead
    (features/ingest/conversions.py). A batch design's job moves its design on in the same
    commit; then the design gets what its plan asks of a completed job (features/ingest/media.py).
    """
    job = running_job(db, job_id, token)
    checked = _checked_outputs(job, body.outputs)
    if job.kind == ARCHIVE_KIND:
        return _complete_archive_job(db, job, checked, body)
    if body.renderer is None:
        raise HTTPException(status_code=400, detail="renderer: what drew the job is required")
    if job.kind == "convert":
        return complete_conversion(db, job, token, {plan.name: output for plan, output in checked}, body.renderer)
    scene = db.get(Scene, job.scene_id) if job.scene_id is not None else None
    if scene is None:
        raise _ended_without_outputs(db, job, "input_missing", "The job's scene was deleted.", 409)
    lock_design_of(db, job)  # a batch design's, before its owner's billing row (ingest/items.py)
    try:
        count_storage_bytes(db, job.user_id, sum(output.bytes for _, output in checked))
    except HTTPException as exc:
        raise _ended_without_outputs(db, job, "over_limit", exc.detail, exc.status_code) from exc

    now = datetime.utcnow()
    db.add_all(_render_row(job, scene, plan, output, now) for plan, output in checked)
    charge_render_job(db, job)
    mark_completed(job, body.renderer, now)
    end_item_of_job(db, job, "completed")
    db.commit()
    db.refresh(job)
    if job.ingest_item_id is not None:
        finish_design_render(db, job)
    return job


def _complete_archive_job(
    db: Session, job: RenderJob, checked: list[tuple[PlannedOutput, RenderJobOutputReport]], body: RenderJobCompleteRequest
) -> RenderJob:
    """A batch_archive job's parts become its batch's archive (features/ingest/archive.py), and
    the parts of the one they replace, queued for deletion with it, are deleted once that is
    committed; any that can't be stay queued for the retention sweep. A batch that is gone (409) or
    storage that can't take the change (402) ends the job instead, its parts deleted."""
    try:
        queued = complete_archive(db, job, checked, body.renderer)
    except ArchiveRefused as refused:
        raise _ended_without_outputs(db, job, refused.code, refused.message, refused.status_code) from refused
    db.commit()
    drain_deletions(db, queued)
    db.refresh(job)
    return job
