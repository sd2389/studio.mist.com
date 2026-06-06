"""Single source of truth for private and public object key prefixes."""

from __future__ import annotations

import re
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
    safe = _safe_name(filename, force_glb=True)
    return f"{customer_models_prefix(user_id)}/{uuid4().hex}-{safe}"


def thumbnail_key(user_id: int, filename: str = "thumbnail.webp") -> str:
    safe = _safe_thumbnail_name(filename)
    return f"{customer_thumbnails_prefix(user_id)}/{uuid4().hex}-{safe}"


def render_key(user_id: int, ext: str) -> str:
    normalized = ext.lstrip(".").lower() or "png"
    return f"{customer_renders_prefix(user_id)}/{uuid4().hex}.{normalized}"


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


def _safe_name(name: str, *, force_glb: bool = False) -> str:
    from pathlib import Path

    base = Path(name or "model.glb").name
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(base).stem)[:120] or "model"
    if force_glb:
        return f"{stem}.glb"
    suf = Path(base).suffix.lower()
    if suf not in (".glb", ".gltf", ".stl", ".3dm"):
        suf = ".glb"
    return f"{stem}{suf}"


def _safe_thumbnail_name(name: str) -> str:
    from pathlib import Path

    base = Path(name or "thumbnail.webp").name
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(base).stem)[:120] or "thumbnail"
    return f"{stem}.webp"


def _safe_sku(sku: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "-", sku.strip())[:128]
    return cleaned or "untitled"
