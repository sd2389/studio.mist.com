"""A customer's saved look templates: materials by slot role, lighting and scene settings, made
from one of their scenes; a bulk upload's batch keeps a checked copy of the one it picks
(docs/adr/0006-bulk-pipeline.md, "Look templates by slot role")."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.scene import Base


class LookTemplate(Base):
    """One saved look, as features/ingest/templates.py validates it."""

    __tablename__ = "look_templates"
    __table_args__ = (
        Index("ix_look_templates_user_id_updated_at", "user_id", "updated_at"),
        # One template a scene: making it again from the same scene brings it up to date.
        Index("uq_look_templates_user_id_source_scene_id", "user_id", "source_scene_id", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    template: Mapped[dict] = mapped_column(JSON)
    # The scene it was made from; a template outlives it.
    source_scene_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
