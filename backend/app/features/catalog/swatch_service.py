"""Generate and persist catalog swatch thumbnails.

Orchestrates: load row → render bytes → write storage → update swatch_key.
Each entity type has one render function; failures on a single row never abort
the batch.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.models.catalog import (
    CatalogBackground,
    CatalogEnvironment,
    CatalogGem,
    CatalogGround,
    CatalogMetal,
    CatalogScenePreset,
)

from . import swatch_renderer

logger = logging.getLogger(__name__)

RenderFn = Callable[[dict[str, Any]], bytes]


def _swatch_key(category: str, slug: str) -> str:
    return f"catalog/swatches/{category}/{slug}.webp"


def _render_metal(params: dict[str, Any]) -> bytes:
    if float(params.get("metalness", 1.0)) < 0.5:
        return swatch_renderer.render_surface_swatch(params)
    return swatch_renderer.render_metal_swatch(params)


_ENTITY_CONFIG: list[tuple[type, str, RenderFn]] = [
    (CatalogMetal, "metals", _render_metal),
    (CatalogGem, "gems", swatch_renderer.render_gem_swatch),
    (CatalogBackground, "backgrounds", swatch_renderer.render_background_swatch),
    (CatalogGround, "grounds", swatch_renderer.render_ground_swatch),
    (CatalogEnvironment, "environments", swatch_renderer.render_environment_swatch),
    (CatalogScenePreset, "scene-presets", swatch_renderer.render_scene_preset_swatch),
]


def generate_for_row(
    db: Session,
    model: type,
    category: str,
    row: Any,
    render_fn: RenderFn,
    *,
    force: bool = False,
) -> bool:
    if row.swatch_key and not force:
        return False
    key = _swatch_key(category, row.slug)
    try:
        data = render_fn(row.params or {})
        storage.write_bytes(key, data, content_type="image/webp")
        row.swatch_key = key
        db.commit()
        return True
    except Exception:
        logger.exception("Swatch generation failed for %s/%s", category, row.slug)
        db.rollback()
        return False


def generate_all(
    db: Session,
    *,
    force: bool = False,
    limit: int | None = None,
) -> dict[str, int]:
    stats = {"generated": 0, "skipped": 0, "failed": 0}

    for model, category, render_fn in _ENTITY_CONFIG:
        query = select(model).where(model.is_active.is_(True)).order_by(model.slug)
        if limit is not None:
            query = query.limit(limit)
        rows = list(db.execute(query).scalars().all())

        for row in rows:
            if row.swatch_key and not force:
                stats["skipped"] += 1
                continue
            ok = generate_for_row(db, model, category, row, render_fn, force=force)
            if ok:
                stats["generated"] += 1
            else:
                stats["failed"] += 1

    return stats
