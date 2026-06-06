"""Generate swatches for user-owned custom materials."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core import storage
from app.features.catalog import swatch_renderer
from app.models.user_library import UserMaterial

logger = logging.getLogger(__name__)


def _swatch_key(user_id: int, material_id: int) -> str:
    return f"users/{user_id}/swatches/materials/{material_id}.webp"


def _render_metal(params: dict[str, Any]) -> bytes:
    if float(params.get("metalness", 1.0)) < 0.5:
        return swatch_renderer.render_surface_swatch(params)
    return swatch_renderer.render_metal_swatch(params)


def generate_material_swatch(db: Session, row: UserMaterial) -> bool:
    key = _swatch_key(row.user_id, row.id)
    try:
        render_fn = _render_metal if row.kind == "metal" else swatch_renderer.render_gem_swatch
        data = render_fn(row.params or {})
        storage.write_bytes(key, data, content_type="image/webp")
        row.swatch_key = key
        db.commit()
        return True
    except Exception:
        logger.exception("User material swatch failed for id=%s", row.id)
        db.rollback()
        return False
