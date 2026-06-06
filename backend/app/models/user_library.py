"""User-owned custom materials and uploaded assets."""

from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.scene import Base


class UserMaterial(Base):
    """Parametric custom metal/gem material owned by a user."""

    __tablename__ = "user_materials"
    __table_args__ = (UniqueConstraint("user_id", "slug", name="uq_user_materials_user_slug"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)  # metal | gem
    slug: Mapped[str] = mapped_column(String(96))
    label: Mapped[str] = mapped_column(String(128))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    family: Mapped[str | None] = mapped_column(String(48), nullable=True)
    gem_family: Mapped[str | None] = mapped_column(String(48), nullable=True)
    swatch_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sort_weight: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="materials")


class UserAsset(Base):
    """Uploaded binary asset (background image, custom HDRI, etc.)."""

    __tablename__ = "user_assets"
    __table_args__ = (UniqueConstraint("user_id", "storage_key", name="uq_user_assets_user_key"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    asset_type: Mapped[str] = mapped_column(String(32), index=True)  # background | metal_env | gem_env
    label: Mapped[str] = mapped_column(String(128))
    storage_key: Mapped[str] = mapped_column(String(512))
    preview_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    byte_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="assets")
