"""Files a batch lets go, deleted from storage once nothing lists them (docs/adr/0006-bulk-pipeline.md,
"Results").

A file is queued (`storage_deletions`) in the same transaction that lets it go: the retention sweep
claiming a batch's raw CAD files, an archive's parts expiring or being replaced, the storage bytes
they counted given back in that transaction. After the commit they are deleted and their rows go.
A deletion that fails, or never runs because the process stopped after the commit, stays queued,
and the sweep tries it again: no file is left behind, and no byte is given back twice, since
deleting never touches the bytes. Deleting a file that is gone already succeeds, so a file deleted
twice (two sweeps at once) is fine.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.core.observability import get_logger, log_event
from app.models import StorageDeletion

# Queued files one drain deletes at most; the next takes the rest.
DELETIONS_PER_DRAIN = 1000
_MAX_ERROR_LENGTH = 1024
_logger = get_logger("studio.ingest")


@dataclass
class Drained:
    deleted: int = 0
    failed: int = 0  # left queued for the next try


def queue_deletions(db: Session, found: Iterable[str], reason: str) -> list[int]:
    """Queue each of a customer's private files for deletion; anything else is never queued. Not
    committed: the caller commits it with what lets the files go. Returns the rows' ids."""
    now = datetime.utcnow()
    rows = [StorageDeletion(key=key, reason=reason, attempts=0, created_at=now) for key in found if keys.is_customer_private_key(key)]
    db.add_all(rows)
    db.flush()
    return [row.id for row in rows]


def drain_deletions(db: Session, ids: Collection[int] | None = None, *, limit: int = DELETIONS_PER_DRAIN) -> Drained:
    """Delete queued files, the oldest first (only those of `ids` when given), each row going once
    its file has: one delete or update by id each, so two drains at once agree."""
    stmt = select(StorageDeletion.id, StorageDeletion.key).order_by(StorageDeletion.id).limit(limit)
    if ids is not None:
        if not ids:
            return Drained()
        stmt = stmt.where(StorageDeletion.id.in_(list(ids)))
    queued = db.execute(stmt).all()
    db.commit()  # the read ends; no lock is held while storage answers
    drained = Drained()
    for row_id, key in queued:
        try:
            storage.delete(key)
        except Exception as exc:  # noqa: BLE001 - kept queued, and logged
            drained.failed += 1
            log_event(_logger, "ingest.storage_delete_failed", key=key, error=str(exc))
            db.execute(
                update(StorageDeletion)
                .where(StorageDeletion.id == row_id)
                .values(attempts=StorageDeletion.attempts + 1, last_error=str(exc)[:_MAX_ERROR_LENGTH])
            )
        else:
            drained.deleted += 1
            db.execute(delete(StorageDeletion).where(StorageDeletion.id == row_id))
        db.commit()
    return drained
