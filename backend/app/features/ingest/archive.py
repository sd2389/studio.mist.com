"""A batch's archive: every file its designs made, and its manifest, in ZIP parts of at most 2 GB,
built by a `batch_archive` job on the CPU pool (docs/adr/0006-bulk-pipeline.md, "Results").

The owner asks for it once the batch has finished; asking while one builds answers that one. The
job is free: it holds no credits. Its worker reads the payload (the manifest as it is then, and a
signed GET for each design's outputs and thumbnail, with its path in the archive), zips them
into parts and uploads them under the job's prefix (render_jobs/archive_spec.py). Completing the
job keeps the parts on the batch for 14 days, counts their bytes toward the owner's storage and
gives back those of the archive it replaces, whose parts go; the retention sweep (retention.py)
deletes them once they expire. A part downloads through a signed URL that lives 300 s.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection
from datetime import datetime, timedelta

from fastapi import HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.core.observability import get_logger, log_event
from app.features.billing.plans import get_quotas, normalize_tier
from app.features.billing.quota_service import count_storage_bytes, get_or_create_billing, release_storage_bytes
from app.features.ingest.items import lock_owner_batches
from app.features.ingest.manifest import MANIFEST_NAME, manifest_csv
from app.features.ingest.renders import BATCH_PRIORITY, MAX_ATTEMPTS
from app.features.ingest.results import DesignFile, design_results
from app.features.render_jobs import idempotency
from app.features.render_jobs.archive_spec import (
    ARCHIVE_KIND,
    ArchiveSpec,
    MANIFEST_ROW_BYTES,
    MAX_PARTS,
    PART_BYTES,
    archive_part_names,
    parts_needed,
)
from app.features.render_jobs.job_files import PlannedOutput, output_stem
from app.features.render_jobs.worker import mark_completed, max_runtime_seconds
from app.features.upload.thumbnails import MAX_THUMBNAIL_BYTES
from app.models import IngestBatch, IngestItem, Render, RenderJob, Scene, User, UserBilling
from app.models.ingest import FINISHED_BATCH_STATUSES
from app.schemas.ingest import IngestArchiveOut, IngestArchivePart, IngestItemJob
from app.schemas.render_job import (
    ArchiveFile,
    ArchiveJobPayload,
    ArchiveLimits,
    ModelPath,
    ModelURL,
    RendererInfo,
    RenderJobOutputReport,
)

# How long a batch's archive parts are kept once made.
ARCHIVE_DAYS = 14
DOWNLOAD_URL_SECONDS = 300
_BUILDING = ("queued", "running")
_logger = get_logger("studio.ingest")


class ArchiveRefused(Exception):
    """The parts can't be kept: the job ends with `code`, its parts deleted."""

    def __init__(self, code: str, status_code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.message = message


class _ArchiveRequest(BaseModel):
    """What an Idempotency-Key is checked against: the batch whose archive was asked for."""

    kind: str
    batch_id: int


# ---------------------------------------------------------------------------
# The parts a batch has
# ---------------------------------------------------------------------------


def live_parts(batch: IngestBatch, now: datetime | None = None) -> list[dict]:
    """The batch's archive parts, until they expire."""
    now = now or datetime.utcnow()
    if batch.archive_job_id is None or not batch.archive_keys:
        return []
    if batch.archive_expires_at is not None and batch.archive_expires_at <= now:
        return []
    return list(batch.archive_keys)


def _part_views(batch: IngestBatch, now: datetime) -> list[IngestArchivePart]:
    return [
        IngestArchivePart(
            part=number,
            name=part["name"],
            bytes=part["bytes"],
            files=part.get("files"),
            download_url=f"/ingest/batches/{batch.id}/archive/{number}",
        )
        for number, part in enumerate(live_parts(batch, now), start=1)
    ]


def archive_views(db: Session, batches: Collection[IngestBatch]) -> dict[int, IngestArchiveOut | None]:
    """Each batch's archive, by its id, in one query: the newest job that builds it and the parts
    the last to complete made; None for a batch whose archive was never asked for."""
    found: dict[int, IngestArchiveOut | None] = {batch.id: None for batch in batches}
    if not batches:
        return found
    jobs: dict[int, list[RenderJob]] = defaultdict(list)
    for job in db.execute(
        select(RenderJob).where(RenderJob.batch_id.in_(list(found)), RenderJob.kind == ARCHIVE_KIND)
    ).scalars():
        jobs[job.batch_id].append(job)
    now = datetime.utcnow()
    for batch in batches:
        batch_jobs = {job.id: job for job in jobs[batch.id]}
        parts = _part_views(batch, now)
        if not batch_jobs and not parts:
            continue
        newest = batch_jobs[max(batch_jobs)] if batch_jobs else None
        made_by = batch_jobs.get(batch.archive_job_id) if parts else None
        found[batch.id] = IngestArchiveOut(
            job=IngestItemJob.model_validate(newest) if newest else None,
            parts=parts,
            made_at=made_by.finished_at if made_by else None,
            expires_at=batch.archive_expires_at if parts else None,
        )
    return found


def download_part(batch: IngestBatch, part: int) -> FileResponse | RedirectResponse:
    """One part of the batch's archive: a redirect to a signed URL that lives 300 s, or on local
    storage the file itself. 404 for a part it hasn't, or once the parts expired."""
    parts = live_parts(batch)
    if not 1 <= part <= len(parts):
        raise HTTPException(status_code=404, detail="Archive part not found")
    found = parts[part - 1]
    local = storage.local_file_if_exists(found["key"])
    if local is not None:
        return FileResponse(local, media_type="application/zip", filename=found["name"])
    return RedirectResponse(storage.presign_get(found["key"], expires_in=DOWNLOAD_URL_SECONDS), status_code=302)


# ---------------------------------------------------------------------------
# Asking for one
# ---------------------------------------------------------------------------


def _building(db: Session, batch_id: int) -> RenderJob | None:
    return db.execute(
        select(RenderJob)
        .where(RenderJob.batch_id == batch_id, RenderJob.kind == ARCHIVE_KIND, RenderJob.status.in_(_BUILDING))
        .order_by(RenderJob.id.desc())
    ).scalars().first()


def _archive_job(
    user: User, batch: IngestBatch, files: list[DesignFile], max_running: int, key: str | None, body_hash: str
) -> RenderJob:
    sizes = [file.bytes if file.bytes is not None else MAX_THUMBNAIL_BYTES for file in files]
    max_parts = parts_needed([*sizes, MANIFEST_ROW_BYTES * batch.item_count])
    if max_parts > MAX_PARTS:
        detail = f"The batch's files are too large for one archive of at most {MAX_PARTS} parts."
        raise HTTPException(status_code=409, detail=detail)
    now = datetime.utcnow()
    stem = output_stem(batch.name, f"batch-{batch.id}")
    return RenderJob(
        user_id=user.id,
        scene_id=None,
        batch_id=batch.id,
        kind=ARCHIVE_KIND,
        spec=ArchiveSpec(batch_id=batch.id, stem=stem, part_bytes=PART_BYTES, max_parts=max_parts).model_dump(),
        look=None,
        name=stem,
        watermark=False,
        priority=BATCH_PRIORITY,
        max_running=max_running,  # the owner's running cap
        max_attempts=MAX_ATTEMPTS,
        credits=0,  # an archive is free
        credit_state="none",
        idempotency_key=key,
        request_hash=body_hash if key is not None else None,
        status="queued",
        attempts=0,
        created_at=now,
        updated_at=now,
    )


def start_archive(db: Session, user: User, batch: IngestBatch, idempotency_key: str | None = None) -> tuple[RenderJob, bool]:
    """Queue the job that builds the batch's archive, and say whether it is new: the one that is
    building already, or the one an earlier request with the same Idempotency-Key made, comes back
    instead. 409 for a batch that hasn't finished, or that has no file to archive."""
    idempotency.check_key(idempotency_key)
    body_hash = idempotency.request_hash(_ArchiveRequest(kind=ARCHIVE_KIND, batch_id=batch.id))
    if idempotency_key is not None and (earlier := idempotency.earlier_jobs(db, user.id, idempotency_key, body_hash, bulk=False)):
        return earlier[0], False
    max_running = get_quotas(normalize_tier(get_or_create_billing(db, user).plan_tier)).max_running_jobs
    lock_owner_batches(db, user.id)  # two requests at once make one job
    db.refresh(batch)
    if batch.status not in FINISHED_BATCH_STATUSES:
        raise HTTPException(status_code=409, detail="A batch's archive is built once the batch has finished")
    if (building := _building(db, batch.id)) is not None:
        db.commit()
        return building, False
    files = [file for result in design_results(db, batch) for file in result.files]
    if not files:
        raise HTTPException(status_code=409, detail="Nothing to archive: no design of this batch has made a file")
    job = _archive_job(user, batch, files, max_running, idempotency_key, body_hash)
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        # A request with the same key queued its job first.
        db.rollback()
        earlier = idempotency.earlier_jobs(db, user.id, idempotency_key, body_hash, bulk=False) if idempotency_key else []
        if not earlier:
            raise
        return earlier[0], False
    db.refresh(job)
    return job, True


# ---------------------------------------------------------------------------
# The worker's side
# ---------------------------------------------------------------------------


def _job_batch(db: Session, job: RenderJob) -> IngestBatch | None:
    batch = db.get(IngestBatch, job.spec["batch_id"])
    return batch if batch is not None and batch.user_id == job.user_id else None


def _source(job: RenderJob, file: DesignFile, expires_in: int) -> ModelURL | ModelPath:
    if storage.signs_urls():
        return ModelURL(url=storage.presign_get(file.key, expires_in=expires_in))
    route = f"renders/{file.render_id}" if file.render_id is not None else f"thumbnails/{file.scene_id}"
    return ModelPath(path=f"/render-jobs/{job.id}/inputs/{route}")


def _unique_path(path: str, taken: set[str]) -> str:
    """`path`, or with -2, -3… before its extension when another file has it already."""
    stem, dot, extension = path.rpartition(".")
    candidate, repeat = path, 2
    while candidate in taken:
        candidate = f"{stem}-{repeat}.{extension}" if dot else f"{path}-{repeat}"
        repeat += 1
    taken.add(candidate)
    return candidate


def archive_payload(db: Session, job: RenderJob) -> ArchiveJobPayload | None:
    """What the job zips: the manifest as it is now, then every file each design made, in the
    order dropped, each signed for as long as the job may run. None when the batch is gone."""
    batch = _job_batch(db, job)
    if batch is None:
        return None
    runtime = max_runtime_seconds(job.kind)
    taken = {MANIFEST_NAME}
    files = [
        ArchiveFile(
            path=_unique_path(file.path, taken),
            source=_source(job, file, runtime),
            bytes=file.bytes,
            max_bytes=file.bytes if file.bytes is not None else MAX_THUMBNAIL_BYTES,
        )
        for result in design_results(db, batch)
        for file in result.files
    ]
    return ArchiveJobPayload(
        kind=ARCHIVE_KIND,
        spec=job.spec,
        manifest_name=MANIFEST_NAME,
        manifest=manifest_csv(db, batch),
        files=files,
        limits=ArchiveLimits(max_runtime_seconds=runtime),
    )


def archive_input_key(db: Session, job: RenderJob, *, render_id: int | None = None, scene_id: int | None = None) -> str | None:
    """The key of an output or a thumbnail the job's batch made, for the local storage routes;
    None for one that isn't the batch's."""
    if job.kind != ARCHIVE_KIND:
        return None
    batch_id = job.spec["batch_id"]
    if render_id is not None:
        return db.execute(
            select(Render.key)
            .join(RenderJob, Render.job_id == RenderJob.id)
            .where(Render.id == render_id, RenderJob.batch_id == batch_id, RenderJob.user_id == job.user_id)
        ).scalar_one_or_none()
    return db.execute(
        select(Scene.thumbnail_key)
        .join(IngestItem, IngestItem.scene_id == Scene.id)
        .where(Scene.id == scene_id, Scene.user_id == job.user_id, IngestItem.batch_id == batch_id)
    ).scalars().first()


def _ordered_parts(
    job: RenderJob, checked: list[tuple[PlannedOutput, RenderJobOutputReport]]
) -> list[RenderJobOutputReport]:
    """The parts in their order: 400 unless they are numbered from 1 with none left out."""
    names = archive_part_names(job.spec)
    ordered = sorted(checked, key=lambda pair: names.index(pair[0].name))
    if [plan.name for plan, _ in ordered] != names[: len(ordered)]:
        raise HTTPException(status_code=400, detail="outputs: the parts are numbered from 1, none left out")
    return [output for _, output in ordered]


def _swap_archive(db: Session, batch_id: int, job_id: int, parts: list[dict], now: datetime) -> tuple[int | None, list[dict]]:
    """Make these the batch's parts, and return the archive they replace (its job and parts), each
    replaced once: the swap only takes the batch as it was read."""
    for _ in range(3):
        old_job_id, old_parts = db.execute(
            select(IngestBatch.archive_job_id, IngestBatch.archive_keys)
            .where(IngestBatch.id == batch_id)
            .execution_options(populate_existing=True)
        ).one()
        as_read = IngestBatch.archive_job_id.is_(None) if old_job_id is None else IngestBatch.archive_job_id == old_job_id
        swapped = db.execute(
            update(IngestBatch)
            .where(IngestBatch.id == batch_id, as_read)
            .values(archive_job_id=job_id, archive_keys=parts, archive_expires_at=now + timedelta(days=ARCHIVE_DAYS), updated_at=now)
            .execution_options(synchronize_session=False)
        ).rowcount
        if swapped:
            return old_job_id, list(old_parts or [])
    raise HTTPException(status_code=409, detail="The batch's archive changed while this one completed; try again")


def delete_parts(user_id: int, job_id: int | None, parts: list[dict]) -> int:
    """Delete an archive's parts, only those under its own job's prefix; how many couldn't be."""
    if job_id is None:
        return 0
    prefix = keys.render_job_prefix(user_id, job_id)
    failed = 0
    for part in parts:
        if not str(part.get("key", "")).startswith(prefix):
            continue
        try:
            storage.delete(part["key"])
        except Exception as exc:  # noqa: BLE001 - logged and left for the sweep
            failed += 1
            log_event(_logger, "ingest.archive_delete_failed", key=part["key"], error=str(exc))
    return failed


def release_archive_bytes(db: Session, user_id: int, released: int) -> None:
    billing = db.execute(select(UserBilling).where(UserBilling.user_id == user_id)).scalars().first()
    if billing is not None and released > 0:
        release_storage_bytes(db, billing, released)


def complete_archive(
    db: Session, job: RenderJob, checked: list[tuple[PlannedOutput, RenderJobOutputReport]], renderer: RendererInfo | None
) -> tuple[int | None, list[dict]]:
    """Keep the job's parts on its batch for 14 days, their bytes counted toward the owner's
    storage, and complete the job; the archive they replace gives its bytes back. Not committed:
    returns that archive (its job and parts), whose files the caller deletes once committed.
    ArchiveRefused when the batch is gone or the owner's storage is full."""
    outputs = _ordered_parts(job, checked)
    batch = _job_batch(db, job)
    if batch is None:
        raise ArchiveRefused("input_missing", 409, "The job's batch was deleted.")
    try:
        # The owner's billing row is locked first, as every change takes it before the batch.
        count_storage_bytes(db, job.user_id, sum(output.bytes for output in outputs))
    except HTTPException as exc:
        raise ArchiveRefused("over_limit", exc.status_code, str(exc.detail)) from exc
    now = datetime.utcnow()
    parts = [
        {
            "name": output.name,
            "key": output.key,
            "bytes": output.bytes,
            "files": output.meta.files if output.meta else None,
            "sha256": output.meta.sha256 if output.meta else None,
        }
        for output in outputs
    ]
    replaced_job_id, replaced = _swap_archive(db, batch.id, job.id, parts, now)
    release_archive_bytes(db, job.user_id, sum(int(part.get("bytes") or 0) for part in replaced))
    mark_completed(job, renderer, now)
    return replaced_job_id, replaced
