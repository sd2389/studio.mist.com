"""Build public URLs for stored object keys."""

from urllib.parse import quote, unquote, urlsplit

from app.config import get_settings
from app.core import storage_keys as keys


def _encode_key_path(key: str) -> str:
    return "/".join(quote(part, safe="") for part in key.strip("/").split("/"))


def private_file_key(url: str) -> str | None:
    """The key of the private file a link from public_file_url names, else None.

    The link must be the app's own /api/files/ path, on APP_PUBLIC_URL's origin or
    root-relative, with no query or fragment, and name a customer's file. Any other link,
    another host's or a data URL, gives None.
    """
    parts = urlsplit(url)
    app = urlsplit(get_settings().app_public_url)
    files_path = f"{app.path.rstrip('/')}/api/files/"
    if parts.query or parts.fragment or not parts.path.startswith(files_path):
        return None
    if (parts.scheme or parts.netloc) and (parts.scheme, parts.netloc.lower()) != (app.scheme, app.netloc.lower()):
        return None
    key = "/".join(unquote(part) for part in parts.path.removeprefix(files_path).split("/"))
    try:
        keys.reject_unsafe_key(key)
    except ValueError:
        return None
    return key if keys.is_customer_private_key(key) else None


def public_file_url(key: str) -> str | None:
    settings = get_settings()
    normalized = key.lstrip("/")
    if not normalized:
        return None

    if keys.is_customer_private_key(normalized):
        return f"{settings.app_public_url.rstrip('/')}/api/files/{_encode_key_path(normalized)}"

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


def embed_url(sku: str) -> str:
    """The piece's embed link, as the studio builds it (buildEmbedUrl in src/lib/embed-settings.ts):
    the studio's public address, then /embed/ and the SKU."""
    return f"{get_settings().app_public_url.rstrip('/')}/embed/{quote(sku.strip(), safe='')}"
