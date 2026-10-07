"""API keys for the customer API (docs/adr/0006-bulk-pipeline.md, "The customer API").

A key acts as its owner on /v1 only. Only a peppered hash of it is stored; the key itself is
shown once, when it is made.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.scene import Base


class ApiKey(Base):
    """One key, as features/api_keys/keys.py makes and checks it."""

    __tablename__ = "api_keys"
    __table_args__ = (
        Index("ix_api_keys_user_id_created_at", "user_id", "created_at"),
        Index("uq_api_keys_prefix", "prefix", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    # Not secret: the key's second part, shown in the list to tell keys apart, and how a
    # request's key is found.
    prefix: Mapped[str] = mapped_column(String(8))
    # Hex HMAC-SHA-256 of the whole key with API_KEY_PEPPER.
    key_hash: Mapped[str] = mapped_column(String(64))
    scopes: Mapped[list[str]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Brought up to date at most once a minute.
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
