"""Scene-side catalog reads: environments, backgrounds, grounds, scene presets."""

from sqlalchemy.orm import Session

from app.features.catalog import repository, serializers
from app.models.catalog import (
    CatalogBackground,
    CatalogEnvironment,
    CatalogGround,
    CatalogScenePreset,
)
from app.schemas.catalog import (
    BackgroundItem,
    CatalogPage,
    EnvironmentItem,
    GroundItem,
    ScenePresetItem,
)


def list_environments(
    db: Session,
    *,
    env_type: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> CatalogPage[EnvironmentItem]:
    rows, total = repository.list_active(
        db,
        CatalogEnvironment,
        filters={"env_type": env_type},
        limit=limit,
        offset=offset,
    )
    return CatalogPage[EnvironmentItem](
        items=[serializers.environment_to_item(row) for row in rows],
        total=total,
        limit=repository.clamp_limit(limit),
        offset=max(offset, 0),
    )


def list_backgrounds(
    db: Session, *, limit: int = 200, offset: int = 0
) -> CatalogPage[BackgroundItem]:
    rows, total = repository.list_active(
        db, CatalogBackground, limit=limit, offset=offset
    )
    return CatalogPage[BackgroundItem](
        items=[serializers.background_to_item(row) for row in rows],
        total=total,
        limit=repository.clamp_limit(limit),
        offset=max(offset, 0),
    )


def list_grounds(
    db: Session, *, limit: int = 200, offset: int = 0
) -> CatalogPage[GroundItem]:
    rows, total = repository.list_active(db, CatalogGround, limit=limit, offset=offset)
    return CatalogPage[GroundItem](
        items=[serializers.ground_to_item(row) for row in rows],
        total=total,
        limit=repository.clamp_limit(limit),
        offset=max(offset, 0),
    )


def list_scene_presets(
    db: Session, *, limit: int = 200, offset: int = 0
) -> CatalogPage[ScenePresetItem]:
    rows, total = repository.list_active(
        db, CatalogScenePreset, limit=limit, offset=offset
    )
    return CatalogPage[ScenePresetItem](
        items=[serializers.scene_preset_to_item(row) for row in rows],
        total=total,
        limit=repository.clamp_limit(limit),
        offset=max(offset, 0),
    )
