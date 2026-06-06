"""Custom asset upload and CRUD for authenticated users."""

from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.features.billing.quota_service import assert_custom_asset_credit, consume_custom_asset_credit
from app.features.user_library import repository, serializers
from app.models.user import User
from app.models.user_library import UserAsset
from app.schemas.library import CreateUserAssetRequest, LibraryPage, UserAssetItem

VALID_ASSET_TYPES = frozenset({"background", "metal_env", "gem_env"})
MAX_ASSET_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = frozenset({"image/png", "image/jpeg", "image/webp"})


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


def register_asset(
    db: Session,
    user_id: int,
    body: CreateUserAssetRequest,
) -> UserAssetItem:
    if body.asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset_type")
    if not body.label.strip():
        raise HTTPException(status_code=400, detail="label is required")
    if not keys.key_belongs_to_user(body.storage_key, user_id):
        raise HTTPException(status_code=400, detail="Invalid storage key")

    user = _user_or_404(db, user_id)
    billing = assert_custom_asset_credit(db, user, body.byte_size or 0)

    row = UserAsset(
        user_id=user_id,
        asset_type=body.asset_type,
        label=body.label.strip(),
        storage_key=body.storage_key,
        preview_key=body.preview_key,
        mime_type=body.mime_type,
        byte_size=body.byte_size,
        meta=body.meta or {},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    consume_custom_asset_credit(db, billing, body.byte_size or 0)
    return serializers.asset_to_item(row)


def upload_asset(
    db: Session,
    user_id: int,
    *,
    file: UploadFile,
    asset_type: str,
    label: str | None = None,
) -> UserAssetItem:
    if asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset_type")

    content_type = file.content_type or "application/octet-stream"
    if asset_type == "background" and content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Background must be PNG, JPEG, or WebP")

    body = file.file.read()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(body) > MAX_ASSET_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 8 MB limit")

    user = _user_or_404(db, user_id)
    billing = assert_custom_asset_credit(db, user, len(body))

    ext = Path(file.filename or "asset.bin").suffix.lower()
    if not ext or ext == ".":
        ext = ".webp" if content_type == "image/webp" else ".jpg" if "jpeg" in content_type else ".png"

    token = uuid4().hex[:12]
    storage_key = f"{keys.customer_assets_prefix(user_id)}/{asset_type}/{token}{ext}"
    storage.write_bytes(storage_key, body, content_type=content_type)

    display_label = (label or file.filename or "Custom asset").strip()
    display_label = re.sub(r"\.[^.]+$", "", display_label)[:128] or "Custom asset"

    row = UserAsset(
        user_id=user_id,
        asset_type=asset_type,
        label=display_label,
        storage_key=storage_key,
        preview_key=storage_key if asset_type == "background" else None,
        mime_type=content_type,
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
