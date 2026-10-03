"""The thumbnail a presigned model upload brings: checked by its bytes, kept under a key of its
own, and dropped rather than refused when it is bad, since a model saves fine without one."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from app.core import storage
from app.core import storage_keys as keys
from app.core.adapters.errors import StorageAdapterError
from app.core.observability import get_logger, log_event
from app.services.image_files import ImageRejectedError, check_image

logger = get_logger("studio.upload")

# The upload page renders 512 x 512 WebP, or PNG in a browser that can't encode WebP.
THUMBNAIL_KINDS = frozenset({"png", "jpeg", "webp"})
MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024
MAX_THUMBNAIL_SIDE = 2048


@dataclass(frozen=True)
class CheckedThumbnail:
    key: str  # where the checked copy is kept; never the presigned key
    data: bytes
    content_type: str


def read_checked_thumbnail(user_id: int, upload_key: str | None) -> CheckedThumbnail | None:
    """The presigned thumbnail as a checked copy, or None when there is none or it is bad.

    A missing, oversized, undecodable or non-image thumbnail is logged and dropped. The copy
    keeps the .webp key name thumbnails have always had; its content type says what the bytes
    are.
    """
    if not upload_key:
        return None
    try:
        data = storage.read_bytes(upload_key, max_bytes=MAX_THUMBNAIL_BYTES)
        image = check_image(
            data,
            kinds=THUMBNAIL_KINDS,
            max_side=MAX_THUMBNAIL_SIDE,
            max_pixels=MAX_THUMBNAIL_SIDE * MAX_THUMBNAIL_SIDE,
        )
    except (HTTPException, StorageAdapterError, ImageRejectedError, OSError) as exc:
        reason = exc.detail if isinstance(exc, HTTPException) else str(exc)
        log_event(logger, "upload.thumbnail_dropped", key=upload_key, reason=reason)
        return None
    return CheckedThumbnail(keys.thumbnail_key(user_id), data, image.content_type)
