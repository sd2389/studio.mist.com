from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.render import Render
    from app.models.user import User


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    model_key: Mapped[str] = mapped_column(String(512))
    material: Mapped[str] = mapped_column(String(64), default="original")
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True, unique=True)
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    lighting: Mapped[str] = mapped_column(String(64), default="studio")
    model_config: Mapped[dict] = mapped_column(JSON, default=dict)
    slot_selections: Mapped[dict] = mapped_column(JSON, default=dict)
    scene_settings: Mapped[dict] = mapped_column(JSON, default=dict)
    variants: Mapped[dict] = mapped_column(JSON, default=dict)
    thumbnail_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    renders: Mapped[list["Render"]] = relationship(
        "Render",
        back_populates="scene",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    project: Mapped["Project | None"] = relationship("Project", back_populates="scenes")
    user: Mapped["User"] = relationship("User", back_populates="scenes")
