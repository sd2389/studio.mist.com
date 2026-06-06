"""Download and persist CC0 Poly Haven HDRI assets for catalog environments.

One job: given a CatalogEnvironment row with params.assetId, fetch the 1k HDR
master and a WebP preview, write to storage, update keys on the row.
"""

from __future__ import annotations

import io
import json
import logging
import urllib.error
import urllib.request
from typing import Any

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.models.catalog import CatalogEnvironment

logger = logging.getLogger(__name__)

_USER_AGENT = "DevJewelsStudio/1.0 (catalog-sync)"
_POLYHAVEN_FILES_API = "https://api.polyhaven.com/files/{asset_id}"
_POLYHAVEN_THUMB_URL = "https://cdn.polyhaven.com/asset_img/thumbs/{asset_id}.png"


def _http_get(url: str, *, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _polyhaven_hdr_url(asset_id: str) -> str:
    payload = json.loads(
        _http_get(_POLYHAVEN_FILES_API.format(asset_id=asset_id), timeout=30).decode()
    )
    hdri = payload.get("hdri") or {}
    for size in ("1k", "2k", "4k"):
        entry = hdri.get(size) or {}
        hdr = entry.get("hdr") or {}
        url = hdr.get("url")
        if url:
            return url
    raise ValueError(f"No HDR URL found for Poly Haven asset {asset_id}")


def _master_key(slug: str) -> str:
    return f"catalog/environments/masters/{slug}.hdr"


def _preview_key(slug: str) -> str:
    return f"catalog/environments/previews/{slug}.webp"


def download_for_row(db: Session, row: CatalogEnvironment, *, force: bool = False) -> bool:
    params: dict[str, Any] = row.params or {}
    if params.get("source") != "polyhaven":
        return False
    asset_id = params.get("assetId")
    if not asset_id:
        return False
    if row.master_key and row.preview_key and not force:
        return False

    try:
        hdr_url = _polyhaven_hdr_url(str(asset_id))
        hdr_bytes = _http_get(hdr_url, timeout=180)
        master = _master_key(row.slug)
        storage.write_bytes(master, hdr_bytes, content_type="image/vnd.radiance")

        thumb_bytes = _http_get(_POLYHAVEN_THUMB_URL.format(asset_id=asset_id), timeout=60)
        img = Image.open(io.BytesIO(thumb_bytes)).convert("RGB")
        img = img.resize((256, 256), Image.Resampling.LANCZOS)
        preview_buf = io.BytesIO()
        img.save(preview_buf, format="WEBP", quality=85)
        preview = _preview_key(row.slug)
        storage.write_bytes(preview, preview_buf.getvalue(), content_type="image/webp")

        row.master_key = master
        row.preview_key = preview
        row.swatch_key = preview
        db.commit()
        return True
    except (urllib.error.URLError, ValueError, OSError) as exc:
        logger.warning("HDRI download failed for %s (%s): %s", row.slug, asset_id, exc)
        db.rollback()
        return False


def sync_all(
    db: Session,
    *,
    force: bool = False,
    limit: int | None = None,
) -> dict[str, int]:
    query = (
        select(CatalogEnvironment)
        .where(CatalogEnvironment.is_active.is_(True))
        .order_by(CatalogEnvironment.sort_weight)
    )
    if limit is not None:
        query = query.limit(limit)
    rows = list(db.execute(query).scalars().all())

    stats = {"downloaded": 0, "skipped": 0, "failed": 0}
    for row in rows:
        if row.master_key and row.preview_key and not force:
            stats["skipped"] += 1
            continue
        if download_for_row(db, row, force=force):
            stats["downloaded"] += 1
        else:
            stats["failed"] += 1
    return stats
