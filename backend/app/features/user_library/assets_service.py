"""Custom asset upload and CRUD for authenticated users."""

from __future__ import annotations

import re
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.features.billing.quota_service import assert_custom_asset_credit, consume_custom_asset_credit
from app.features.user_library import repository, serializers
from app.models.user import User
from app.models.user_library import UserAsset
from app.schemas.library import LibraryPage, UserAssetItem
from app.services.image_files import CheckedImage, ImageRejectedError, WrongImageKindError, check_image

MAX_ASSET_BYTES = 8 * 1024 * 1024
MAX_ASSET_SIDE = 8192  # an 8K equirectangular environment is 8192 x 4096
MAX_ASSET_PIXELS = 40_000_000
_ENVIRONMENT_KINDS = frozenset({"hdr", "exr", "jpeg"})
# The formats the studio can draw for each asset type. Backgrounds are plain images.
# Environments go through drei's useEnvironment, which picks a loader by extension:
# RGBELoader for .hdr, EXRLoader for .exr, HDRJPGLoader for .jpg (a JPEG without a gain
# map shows as plain SDR). It has no loader for a single PNG or WebP.
ASSET_IMAGE_KINDS = {
    "background": frozenset({"png", "jpeg", "webp"}),
    "metal_env": _ENVIRONMENT_KINDS,
    "gem_env": _ENVIRONMENT_KINDS,
}
VALID_ASSET_TYPES = frozenset(ASSET_IMAGE_KINDS)
_WRONG_KIND_DETAIL = {
    "background": "Backgrounds must be PNG, JPEG or WebP images.",
    "metal_env": "Environment maps must be Radiance HDR (.hdr), OpenEXR (.exr) or JPEG files.",
    "gem_env": "Environment maps must be Radiance HDR (.hdr), OpenEXR (.exr) or JPEG files.",
}


def check_asset_image(payload: bytes, asset_type: str) -> CheckedImage:
    """The asset's image, judged by its bytes: 415 for a format this asset type can't use,
    422 for a file in the right format that can't be read or is too large."""
    try:
        return check_image(
            payload,
            kinds=ASSET_IMAGE_KINDS[asset_type],
            max_side=MAX_ASSET_SIDE,
            max_pixels=MAX_ASSET_PIXELS,
        )
    except WrongImageKindError as exc:
        raise HTTPException(status_code=415, detail=_WRONG_KIND_DETAIL[asset_type]) from exc
    except ImageRejectedError as exc:
        raise HTTPException(status_code=422, detail=f"This file can't be used: {exc}.") from exc


def _user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def list_assets(
    db: Session,
    user_id: int,
    *,
    asset_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> LibraryPage[UserAssetItem]:
    if asset_type and asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset_type")
    rows, total = repository.list_assets(
        db, user_id, asset_type=asset_type, limit=limit, offset=offset
    )
    return LibraryPage[UserAssetItem](
        items=[serializers.asset_to_item(row) for row in rows],
        total=total,
        limit=repository.clamp_limit(limit),
        offset=max(offset, 0),
    )


def upload_asset(
    db: Session,
    user_id: int,
    *,
    file: UploadFile,
    asset_type: str,
    label: str | None = None,
) -> UserAssetItem:
    """Store an image for the user's library. Its format, extension and content type come
    from its bytes, never the file name or the content type the client sent."""
    if asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset_type")

    body = file.file.read(MAX_ASSET_BYTES + 1)  # one byte over is enough to refuse it
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(body) > MAX_ASSET_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 8 MB limit")
    image = check_asset_image(body, asset_type)

    user = _user_or_404(db, user_id)
    billing = assert_custom_asset_credit(db, user, len(body))

    token = uuid4().hex[:12]
    storage_key = f"{keys.customer_assets_prefix(user_id)}/{asset_type}/{token}{image.extension}"
    storage.write_bytes(storage_key, body, content_type=image.content_type)

    display_label = (label or file.filename or "Custom asset").strip()
    display_label = re.sub(r"\.[^.]+$", "", display_label)[:128] or "Custom asset"

    row = UserAsset(
        user_id=user_id,
        asset_type=asset_type,
        label=display_label,
        storage_key=storage_key,
        preview_key=storage_key if asset_type == "background" else None,
        mime_type=image.content_type,
        byte_size=len(body),
        meta={},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    consume_custom_asset_credit(db, billing, len(body))
    return serializers.asset_to_item(row)


def delete_asset(db: Session, user_id: int, asset_id: int) -> None:
    row = repository.get_asset(db, user_id, asset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(row)
    db.commit()
