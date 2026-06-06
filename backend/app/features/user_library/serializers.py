"""Map user library ORM rows to response DTOs."""

from app.core.public_urls import public_file_url
from app.models.user_library import UserAsset, UserMaterial
from app.schemas.library import UserAssetItem, UserMaterialItem


def material_to_item(row: UserMaterial) -> UserMaterialItem:
    return UserMaterialItem(
        id=row.id,
        kind=row.kind,
        slug=row.slug,
        label=row.label,
        params=row.params or {},
        category=row.category,
        family=row.family,
        gem_family=row.gem_family,
        swatch_url=public_file_url(row.swatch_key) if row.swatch_key else None,
        sort_weight=row.sort_weight,
        created_at=row.created_at,
    )


def asset_to_item(row: UserAsset) -> UserAssetItem:
    return UserAssetItem(
        id=row.id,
        asset_type=row.asset_type,
        label=row.label,
        url=public_file_url(row.storage_key),
        preview_url=public_file_url(row.preview_key) if row.preview_key else public_file_url(row.storage_key),
        mime_type=row.mime_type,
        byte_size=row.byte_size,
        meta=row.meta or {},
        created_at=row.created_at,
    )
