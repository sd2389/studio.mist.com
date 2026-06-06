"""Build public URLs for stored object keys."""

from urllib.parse import quote

from app.config import get_settings
from app.core import storage_keys as keys


def _encode_key_path(key: str) -> str:
    return "/".join(quote(part, safe="") for part in key.strip("/").split("/"))


def public_file_url(key: str) -> str | None:
    settings = get_settings()
    normalized = key.lstrip("/")
    if not normalized:
        return None

    if keys.is_public_published_key(normalized) and settings.r2_public_base_url:
        return f"{settings.r2_public_base_url.rstrip('/')}/{_encode_key_path(normalized)}"

    if settings.public_cdn_origin:
        return f"{settings.public_cdn_origin.rstrip('/')}/{_encode_key_path(normalized)}"

    if settings.public_api_base:
        return f"{settings.public_api_base.rstrip('/')}/files/{_encode_key_path(normalized)}"

    return None


def published_scene_model_url(user_id: int, sku: str) -> str | None:
    return public_file_url(keys.public_model_key(user_id, sku))


def published_scene_thumbnail_url(user_id: int, sku: str) -> str | None:
    return public_file_url(keys.public_thumbnail_key(user_id, sku))
