"""Cache-Control policies for stored object keys."""

from __future__ import annotations

_IMMUTABLE_PREFIXES = ("models/", "renders/", "library/", "customers/", "published/")
_SHORT_TTL_PREFIXES = ("thumbnails/",)


def cache_control_for_key(key: str) -> str:
    normalized = key.lstrip("/")
    if normalized.startswith(_IMMUTABLE_PREFIXES):
        return "public, max-age=31536000, immutable"
    if normalized.startswith(_SHORT_TTL_PREFIXES):
        return "public, max-age=86400"
    if normalized.startswith("catalog/"):
        return "public, max-age=604800"
    return "public, max-age=3600"
