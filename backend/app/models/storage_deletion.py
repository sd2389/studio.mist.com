"""Stored files waiting to be deleted (docs/adr/0006-bulk-pipeline.md, "Results")."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.scene import Base


class StorageDeletion(Base):
    """A stored file nothing lists any more, to delete. It is queued in the transaction that lets
    the file go (a batch's raw CAD files claimed by the retention sweep, an archive's parts expired
    or replaced), with any storage bytes it counted already given back; then deleted, and the row
    with it. A deletion that fails, or never ran because the process stopped, stays queued for the
    sweep to try again."""

    __tablename__ = "storage_deletions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(512))
    reason: Mapped[str] = mapped_column(String(32))  # raw_cad, archive_expired, archive_replaced
    attempts: Mapped[int] = mapped_column(Integer, default=0)  # deletions that failed
    last_error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
