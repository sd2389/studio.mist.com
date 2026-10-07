"""The retention sweep: what a batch keeps for a while only goes once it expires
(docs/adr/0006-bulk-pipeline.md, "Limits for batches" and "Results").

- **Raw CAD files**, every design's source and companions, 30 days after the batch finished
  (`expires_at`). They never counted toward storage, so no bytes go back; from then on the
  batch's designs can't convert again (`sources_gone`).
- **Archive parts**, 14 days after they were made (`archive_expires_at`). Their bytes go back to
  the owner's storage in the transaction that takes the parts off the batch.

Each batch is claimed with one conditional UPDATE, so sweeps running at once, or again, act on it
once: a second finds it claimed and leaves it. The claim queues the files for deletion in its own
transaction (deletions.py): raw files under the owner's batch lock, which a retry takes too,
marked `sources_deleted_at`; an archive's parts taken off the batch with their bytes given back,
the billing row locked before the batch as every change takes them, only if the batch still has
those parts. Then every queued file is deleted, its row with it. A sweep that stops after a claim,
or a deletion that fails, leaves the files queued, and the next sweep deletes them: none is left
behind, and no byte is given back twice. Files an archive that replaced another queued are
deleted the same way.

Only keys under the batch's own prefixes are ever queued: a design's files under
customers/<user>/ingest/<batch>/<item>/, an archive's under its job's renders prefix. A scene's
model, thumbnail and renders live elsewhere and stay. Run it daily:
`python -m scripts.sweep_ingest_retention` (scripts/).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core import storage_keys as keys
from app.features.ingest.archive import part_bytes_of, part_keys, release_archive_bytes
from app.features.ingest.deletions import drain_deletions, queue_deletions
from app.features.ingest.items import lock_owner_batches
from app.models import IngestBatch, IngestItem
from app.models.ingest import FINISHED_BATCH_STATUSES

# Batches each pass claims at most; the next run takes the rest.
BATCHES_PER_PASS = 200


@dataclass
class SweepResult:
    sources_batches: int = 0  # batches whose raw CAD files were claimed
    source_files: int = 0  # and queued for deletion
    archives: int = 0  # archives whose parts were taken off their batches
    archive_bytes: int = 0  # given back to their owners' storage
    deleted: int = 0  # queued files deleted, this run's and any left before
    failures: int = 0  # files that couldn't be deleted, left queued for the next run


def sources_gone(batch: IngestBatch, now: datetime | None = None) -> bool:
    """Whether the batch's raw CAD files are deleted, or due to be: its designs can't convert again."""
    now = now or datetime.utcnow()
    return batch.sources_deleted_at is not None or (batch.expires_at is not None and batch.expires_at <= now)


def _sources_due(now: datetime) -> tuple:
    return (
        IngestBatch.status.in_(FINISHED_BATCH_STATUSES),
        IngestBatch.expires_at.is_not(None),
        IngestBatch.expires_at <= now,
        IngestBatch.sources_deleted_at.is_(None),
    )


def _archive_due(now: datetime) -> tuple:
    return IngestBatch.archive_job_id.is_not(None), IngestBatch.archive_expires_at <= now


def source_keys(db: Session, batch_id: int, user_id: int) -> list[str]:
    """Every design's CAD file and companions, only those under the design's own ingest prefix."""
    found = []
    for item in db.execute(select(IngestItem).where(IngestItem.batch_id == batch_id)).scalars():
        prefix = keys.ingest_item_prefix(user_id, batch_id, item.id)
        candidates = [item.source_key, *(companion.get("key", "") for companion in item.companions or [])]
        found += [key for key in candidates if key and key.startswith(prefix)]
    return found


def sweep_sources(db: Session, batch_id: int, user_id: int, now: datetime, result: SweepResult) -> None:
    """Claim one batch's raw files, under its owner's lock, and queue them for deletion in the
    same commit; a batch claimed already, or no longer due (retried meanwhile), is left."""
    lock_owner_batches(db, user_id)
    claimed = db.execute(
        update(IngestBatch)
        .where(IngestBatch.id == batch_id, *_sources_due(now))
        .values(sources_deleted_at=now, updated_at=now)
        .execution_options(synchronize_session=False)
    ).rowcount
    if not claimed:
        db.rollback()
        return
    found = source_keys(db, batch_id, user_id)
    queue_deletions(db, found, reason="raw_cad")
    db.commit()
    result.sources_batches += 1
    result.source_files += len(found)


def sweep_archive(db: Session, batch_id: int, user_id: int, job_id: int, parts: list[dict], now: datetime, result: SweepResult) -> None:
    """Take one batch's expired parts off it, give their bytes back and queue them for deletion,
    in one transaction, if the batch still has these parts: a second sweep, or a new archive that
    replaced them (and gave their bytes back itself), finds it hasn't."""
    released = part_bytes_of(parts)
    release_archive_bytes(db, user_id, released)  # the billing row first, as every change takes it
    cleared = db.execute(
        update(IngestBatch)
        .where(IngestBatch.id == batch_id, IngestBatch.archive_job_id == job_id, IngestBatch.archive_expires_at <= now)
        .values(archive_job_id=None, archive_keys=None, archive_expires_at=None, updated_at=now)
        .execution_options(synchronize_session=False)
    ).rowcount
    if not cleared:
        db.rollback()  # and the bytes with it
        return
    queue_deletions(db, part_keys(user_id, job_id, parts), reason="archive_expired")
    db.commit()
    result.archives += 1
    result.archive_bytes += released


def sweep_expired(db: Session, now: datetime | None = None, *, limit: int = BATCHES_PER_PASS) -> SweepResult:
    """Claim every batch's raw CAD files and archive parts past their time, then delete every file
    queued, this run's and any an earlier run or a replaced archive left (see above)."""
    now = now or datetime.utcnow()
    result = SweepResult()
    due_sources = db.execute(
        select(IngestBatch.id, IngestBatch.user_id).where(*_sources_due(now)).order_by(IngestBatch.expires_at).limit(limit)
    ).all()
    due_archives = db.execute(
        select(IngestBatch.id, IngestBatch.user_id, IngestBatch.archive_job_id, IngestBatch.archive_keys)
        .where(*_archive_due(now))
        .order_by(IngestBatch.archive_expires_at)
        .limit(limit)
    ).all()
    db.commit()  # the reads end; each batch is claimed again in its own transaction
    for batch_id, user_id in due_sources:
        sweep_sources(db, batch_id, user_id, now, result)
    for batch_id, user_id, job_id, parts in due_archives:
        sweep_archive(db, batch_id, user_id, job_id, list(parts or []), now, result)
    drained = drain_deletions(db)
    result.deleted, result.failures = drained.deleted, drained.failed
    return result
