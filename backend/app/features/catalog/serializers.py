"""Map catalog ORM rows to response DTOs. Pure functions, one per entity."""

from app.core.public_urls import public_file_url
from app.models.catalog import (
    CatalogBackground,
    CatalogEnvironment,
    CatalogGem,
    CatalogGround,
    CatalogMetal,
    CatalogScenePreset,
)
from app.schemas.catalog import (
    BackgroundItem,
    EnvironmentItem,
    GemItem,
    GroundItem,
    MetalItem,
    ScenePresetItem,
)


def metal_to_item(row: CatalogMetal) -> MetalItem:
    return MetalItem(
        slug=row.slug,
        label=row.label,
        params=row.params or {},
        sort_weight=row.sort_weight,
        swatch_url=public_file_url(row.swatch_key) if row.swatch_key else None,
        category=row.category,
        family=row.family,
    )


def gem_to_item(row: CatalogGem) -> GemItem:
    return GemItem(
        slug=row.slug,
        label=row.label,
        params=row.params or {},
        sort_weight=row.sort_weight,
        swatch_url=public_file_url(row.swatch_key) if row.swatch_key else None,
        gem_family=row.gem_family,
    )


def environment_to_item(row: CatalogEnvironment) -> EnvironmentItem:
    return EnvironmentItem(
        slug=row.slug,
        label=row.label,
        params=row.params or {},
        sort_weight=row.sort_weight,
        swatch_url=public_file_url(row.swatch_key) if row.swatch_key else None,
        env_type=row.env_type,
        preview_url=public_file_url(row.preview_key) if row.preview_key else None,
        master_url=public_file_url(row.master_key) if row.master_key else None,
        default_rotation=row.default_rotation,
        default_intensity=row.default_intensity,
    )


def background_to_item(row: CatalogBackground) -> BackgroundItem:
    return BackgroundItem(
        slug=row.slug,
        label=row.label,
        params=row.params or {},
        sort_weight=row.sort_weight,
        swatch_url=public_file_url(row.swatch_key) if row.swatch_key else None,
        is_transparent=row.is_transparent,
    )


def ground_to_item(row: CatalogGround) -> GroundItem:
    return GroundItem(
        slug=row.slug,
        label=row.label,
        params=row.params or {},
        sort_weight=row.sort_weight,
        swatch_url=public_file_url(row.swatch_key) if row.swatch_key else None,
    )


def scene_preset_to_item(row: CatalogScenePreset) -> ScenePresetItem:
    return ScenePresetItem(
        slug=row.slug,
        label=row.label,
        params=row.params or {},
        sort_weight=row.sort_weight,
        swatch_url=public_file_url(row.swatch_key) if row.swatch_key else None,
    )
