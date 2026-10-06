"""A batch's CAD files go from the browser straight to private storage through signed PUTs, never
through the API (docs/adr/0006-bulk-pipeline.md, "Uploading in bulk" and "Security").

One call signs the files of up to 100 designs, each URL for 15 minutes with the file's type and
size signed in, so storage refuses a file of any other size. Confirming checks every file of a
design is stored at its declared size before the design moves on.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.features.ingest.conversions import queue_conversions
from app.features.ingest.designs import file_name
from app.features.ingest.items import lock_owner_batches, locked_items
from app.features.ingest.service import item_view, owned_batch, owner_tier
from app.models import IngestBatch, IngestItem, User
from app.models.ingest import OPEN_BATCH_STATUSES
from app.schemas.ingest import IngestUpload, IngestUploaded, IngestUploadMissing, IngestUploads

UPLOAD_URL_SECONDS = 900
UPLOAD_CONTENT_TYPE = "application/octet-stream"


def _design_files(item: IngestItem) -> list[tuple[str, str, int]]:
    """A design's files, its CAD file first: each one's path as dropped, its key and its size."""
    companions = [(file["filename"], file["key"], file["bytes"]) for file in item.companions]
    return [(item.filename, item.source_key, item.source_bytes), *companions]


def _assert_open(batch: IngestBatch) -> None:
    if batch.status not in OPEN_BATCH_STATUSES:
        raise HTTPException(status_code=409, detail=f"Batch is {batch.status}")


def _batch_items(db: Session, batch: IngestBatch, item_ids: list[int]) -> list[IngestItem]:
    """The batch's designs these ids name, in the order asked; 404 for an id that isn't one."""
    found = {
        item.id: item
        for item in db.execute(
            select(IngestItem).where(IngestItem.batch_id == batch.id, IngestItem.id.in_(item_ids))
        ).scalars()
    }
    for item_id in item_ids:
        if item_id not in found:
            raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
    return [found[item_id] for item_id in dict.fromkeys(item_ids)]


def upload_targets(db: Session, user: User, batch_id: int, item_ids: list[int]) -> IngestUploads:
    """A signed PUT for each file of these designs, which must be awaiting their uploads; asking
    again signs new URLs. Local storage signs none: 503, as for a single presigned upload."""
    batch = owned_batch(db, user, batch_id)
    _assert_open(batch)
    items = _batch_items(db, batch, item_ids)
    for item in items:
        if item.status != "awaiting_upload":
            raise HTTPException(status_code=409, detail=f"Item {item.id} is {item.status}, not awaiting its upload")
    if not storage.signs_urls():
        raise HTTPException(
            status_code=503, detail="Bulk uploads go straight to cloud storage (STORAGE_BACKEND=r2 or s3), not to local storage"
        )
    uploads = []
    for item in items:
        for filename, key, size in _design_files(item):
            # The download name is the key's own: cleaned, so the signed header holds it as it is.
            url, headers = storage.presign_upload(
                key, UPLOAD_CONTENT_TYPE, size, key.rsplit("/", 1)[1], expires_in=UPLOAD_URL_SECONDS
            )
            uploads.append(IngestUpload(item_id=item.id, filename=filename, url=url, headers=headers))
    return IngestUploads(files=uploads, expires_in=UPLOAD_URL_SECONDS)


def _upload_problem(item: IngestItem) -> str | None:
    """Why a design's files aren't all stored at their declared sizes; None when they are."""
    for filename, key, size in _design_files(item):
        stored = storage.object_size(key)
        if stored is None:
            return f"{file_name(filename)} is not uploaded yet."
        if stored != size:
            return f"{file_name(filename)}: {size:,} bytes declared, {stored:,} stored."
    return None


def _move_on(db: Session, user: User, batch_id: int, item_ids: list[int]) -> None:
    """Confirmed designs move on: uploaded in a draft batch, converting in a submitted one."""
    lock_owner_batches(db, user.id)
    batch = owned_batch(db, user, batch_id)  # as it is now: it may have been submitted meanwhile
    _assert_open(batch)
    items = locked_items(db, IngestItem.id.in_(item_ids), IngestItem.status == "awaiting_upload")
    now = datetime.utcnow()
    if batch.status == "draft":
        for item in items:
            item.status = "uploaded"
            item.updated_at = now
    else:
        queue_conversions(db, batch, items, owner_tier(db, user), now)
    db.commit()


def confirm_uploads(db: Session, user: User, batch_id: int, item_ids: list[int]) -> IngestUploaded:
    """Check each design's files are stored at their declared sizes. Those that are move on:
    uploaded, or converting once the batch is submitted. The others stay awaiting their uploads
    and say why. A design that moved on already is answered as it is."""
    batch = owned_batch(db, user, batch_id)
    _assert_open(batch)
    items = _batch_items(db, batch, item_ids)
    missing: list[IngestUploadMissing] = []
    stored: list[int] = []
    for item in items:
        if item.status != "awaiting_upload":
            continue
        # Storage is asked before any lock is taken.
        if problem := _upload_problem(item):
            missing.append(IngestUploadMissing(item_id=item.id, message=problem))
        else:
            stored.append(item.id)
    if stored:
        _move_on(db, user, batch.id, stored)
    return IngestUploaded(items=[item_view(item) for item in items], missing=missing)
