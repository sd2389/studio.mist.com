"""Single source of truth for private and public object key prefixes."""

from __future__ import annotations

import re
from pathlib import PurePosixPath
from uuid import uuid4

CUSTOMER_PREFIX = "customers"
PUBLIC_PREFIX = "published"

_LEGACY_MODEL_PREFIX = "models/"
_LEGACY_THUMBNAIL_PREFIX = "thumbnails/"
_LEGACY_RENDER_PREFIX = "renders/"


def customer_prefix(user_id: int) -> str:
    return f"{CUSTOMER_PREFIX}/{user_id}"


def customer_models_prefix(user_id: int) -> str:
    return f"{customer_prefix(user_id)}/models"


def customer_thumbnails_prefix(user_id: int) -> str:
    return f"{customer_prefix(user_id)}/thumbnails"


def customer_renders_prefix(user_id: int) -> str:
    return f"{customer_prefix(user_id)}/renders"


def customer_ai_prefix(user_id: int) -> str:
    return f"{customer_prefix(user_id)}/ai"


def customer_assets_prefix(user_id: int) -> str:
    return f"{customer_prefix(user_id)}/assets"


def model_key(user_id: int, filename: str) -> str:
    safe = _safe_glb_name(filename)
    return f"{customer_models_prefix(user_id)}/{uuid4().hex}-{safe}"


def thumbnail_key(user_id: int, filename: str = "thumbnail.webp") -> str:
    safe = _safe_thumbnail_name(filename)
    return f"{customer_thumbnails_prefix(user_id)}/{uuid4().hex}-{safe}"


def render_key(user_id: int, ext: str) -> str:
    normalized = ext.lstrip(".").lower() or "png"
    return f"{customer_renders_prefix(user_id)}/{uuid4().hex}.{normalized}"


def render_job_prefix(user_id: int, job_id: int) -> str:
    """Where a render job's outputs live; a worker may write only under its own job's."""
    return f"{customer_renders_prefix(user_id)}/{job_id}/"


def render_job_output_key(user_id: int, job_id: int, filename: str) -> str:
    """One output of a render job, under the job's prefix, by its file name (already cleaned)."""
    return f"{render_job_prefix(user_id, job_id)}{filename}"


def ingest_item_prefix(user_id: int, batch_id: int, item_id: int) -> str:
    """Where a batch design's raw CAD files live: private, and never counted toward storage."""
    return f"{customer_prefix(user_id)}/ingest/{batch_id}/{item_id}/"


def ingest_source_key(user_id: int, batch_id: int, item_id: int, filename: str) -> str:
    return f"{ingest_item_prefix(user_id, batch_id, item_id)}{safe_file_name(filename)}"


def ingest_companion_key(user_id: int, batch_id: int, item_id: int, index: int, filename: str) -> str:
    """A design's companion file (an OBJ's MTL, a glTF's .bin), numbered so two never share a key."""
    return f"{ingest_item_prefix(user_id, batch_id, item_id)}companions/{index}-{safe_file_name(filename)}"


def safe_file_name(name: str) -> str:
    """A file's own name, without its folders, cleaned to [A-Za-z0-9._-]; its suffix kept, lower case."""
    base = PurePosixPath((name or "").replace("\\", "/")).name
    suffix = PurePosixPath(base).suffix.lower()
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", base[: len(base) - len(suffix)])[:120] or "file"
    return f"{stem}{re.sub(r'[^a-z0-9.]', '', suffix)}"


def ai_render_key(user_id: int, ext: str = "png") -> str:
    normalized = ext.lstrip(".").lower() or "png"
    return f"{customer_ai_prefix(user_id)}/{uuid4().hex}.{normalized}"


def public_published_prefix(user_id: int, sku: str) -> str:
    safe_sku = _safe_sku(sku)
    return f"{PUBLIC_PREFIX}/{user_id}/{safe_sku}"


def public_model_key(user_id: int, sku: str) -> str:
    return f"{public_published_prefix(user_id, sku)}/model.glb"


def public_thumbnail_key(user_id: int, sku: str) -> str:
    return f"{public_published_prefix(user_id, sku)}/thumbnail.webp"


def public_media_key(user_id: int, sku: str, job_id: int, filename: str) -> str:
    """A render job's output published beside the piece's model. The job's id keeps a re-render
    from hiding behind the year-long cache published files get."""
    return f"{public_published_prefix(user_id, sku)}/media/{job_id}/{filename}"


def reject_unsafe_key(key: str) -> None:
    """Reject path traversal and absolute paths in storage object keys."""
    if not key.strip() or key.startswith("/") or ".." in key or "\\" in key:
        raise ValueError("Invalid storage key")


def key_belongs_to_user(key: str, user_id: int) -> bool:
    prefix = f"{customer_prefix(user_id)}/"
    legacy = f"users/{user_id}/"
    return key.startswith(prefix) or key.startswith(legacy)


def is_customer_private_key(key: str) -> bool:
    return key.startswith(f"{CUSTOMER_PREFIX}/") or key.startswith("users/")


def is_public_published_key(key: str) -> bool:
    return key.startswith(f"{PUBLIC_PREFIX}/")


def is_legacy_upload_key(key: str) -> bool:
    return (
        key.startswith(_LEGACY_MODEL_PREFIX)
        or key.startswith(_LEGACY_THUMBNAIL_PREFIX)
        or key.startswith(_LEGACY_RENDER_PREFIX)
        or key.startswith("ai-renders/")
        or key.startswith("users/")
    )


def _safe_glb_name(name: str) -> str:
    """Stored models are always GLB (the browser converts every CAD format before upload)."""
    from pathlib import Path

    base = Path(name or "model.glb").name
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(base).stem)[:120] or "model"
    return f"{stem}.glb"


def _safe_thumbnail_name(name: str) -> str:
    from pathlib import Path

    base = Path(name or "thumbnail.webp").name
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(base).stem)[:120] or "thumbnail"
    return f"{stem}.webp"


def _safe_sku(sku: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "-", sku.strip())[:128]
    return cleaned or "untitled"
