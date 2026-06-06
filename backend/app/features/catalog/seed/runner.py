"""Idempotent catalog seeding.

Upserts each seed list by `slug`: existing rows are updated in place, new rows are
inserted. Safe to run repeatedly (e.g. on deploy). One job per function.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import (
    CatalogBackground,
    CatalogEnvironment,
    CatalogGem,
    CatalogGround,
    CatalogMetal,
    CatalogMixin,
    CatalogScenePreset,
)

from .backgrounds import BACKGROUNDS
from .environments import ENVIRONMENTS, LEGACY_SYNTHETIC_SLUGS
from .gems import GEMS
from .grounds import GROUNDS
from .metals import ALL_METALS, METALS
from .scene_presets import SCENE_PRESETS


def _upsert(db: Session, model: type[CatalogMixin], entries: list[dict[str, Any]]) -> int:
    for index, entry in enumerate(entries):
        slug = entry["slug"]
        row = db.execute(
            select(model).where(model.slug == slug)
        ).scalar_one_or_none()
        if row is None:
            row = model(slug=slug)
            db.add(row)
        for key, value in entry.items():
            setattr(row, key, value)
        row.sort_weight = entry.get("sort_weight", index * 10)
        row.is_active = entry.get("is_active", True)
    db.commit()
    return len(entries)


def _deactivate_legacy_base_metals(db: Session) -> None:
    """Base metals (no finish suffix) are superseded by metal×finish swatch rows."""
    legacy_slugs = {m["slug"] for m in METALS}
    rows = db.execute(
        select(CatalogMetal).where(CatalogMetal.slug.in_(legacy_slugs))
    ).scalars().all()
    for row in rows:
        row.is_active = False
    db.commit()


def _deactivate_legacy_synthetic_envs(db: Session) -> None:
    rows = db.execute(
        select(CatalogEnvironment).where(CatalogEnvironment.slug.in_(LEGACY_SYNTHETIC_SLUGS))
    ).scalars().all()
    for row in rows:
        row.is_active = False
    db.commit()


def seed_all(db: Session) -> dict[str, int]:
    metal_count = _upsert(db, CatalogMetal, ALL_METALS)
    _deactivate_legacy_base_metals(db)
    env_count = _upsert(db, CatalogEnvironment, ENVIRONMENTS)
    _deactivate_legacy_synthetic_envs(db)
    return {
        "metals": metal_count,
        "gems": _upsert(db, CatalogGem, GEMS),
        "environments": env_count,
        "backgrounds": _upsert(db, CatalogBackground, BACKGROUNDS),
        "grounds": _upsert(db, CatalogGround, GROUNDS),
        "scene_presets": _upsert(db, CatalogScenePreset, SCENE_PRESETS),
    }
