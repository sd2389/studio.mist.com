"""Clean-room parametric catalog tables.

Every catalog entry is parametric JSON (PBR numbers, gradient stops, scene
references) rather than a downloadable binary asset. The renderer turns these
parameters into a look at runtime, so there is no proprietary material file to
leak. Heavy binaries (HDRIs) are referenced by storage key only.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.scene import Base


class CatalogMixin:
    """Columns shared by every catalog entity. Keeps the tables DRY and uniform."""

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(96), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(128))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    sort_weight: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    swatch_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CatalogMetal(CatalogMixin, Base):
    """Metals and non-metal surfaces (leather, ceramic, enamel, ...)."""

    __tablename__ = "catalog_metals"

    category: Mapped[str] = mapped_column(String(32), default="metal", index=True)
    family: Mapped[str] = mapped_column(String(48), default="gold", index=True)


class CatalogGem(CatalogMixin, Base):
    """Transmissive / opaque gem materials."""

    __tablename__ = "catalog_gems"

    gem_family: Mapped[str] = mapped_column(String(48), default="diamond", index=True)


class CatalogEnvironment(CatalogMixin, Base):
    """HDRI environment maps. Masters stay in private storage; only keys live here."""

    __tablename__ = "catalog_environments"

    env_type: Mapped[str] = mapped_column(String(32), default="metal_env", index=True)
    master_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    preview_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    default_rotation: Mapped[float] = mapped_column(Float, default=0.0)
    default_intensity: Mapped[float] = mapped_column(Float, default=1.0)


class CatalogBackground(CatalogMixin, Base):
    """Solid / gradient backdrops, generated from a gradient spec (no binary)."""

    __tablename__ = "catalog_backgrounds"

    is_transparent: Mapped[bool] = mapped_column(Boolean, default=False)


class CatalogGround(CatalogMixin, Base):
    """Shadow / reflection ground-plane presets."""

    __tablename__ = "catalog_grounds"


class CatalogScenePreset(CatalogMixin, Base):
    """One-click scene bundles referencing env/background/ground slugs."""

    __tablename__ = "catalog_scene_presets"
