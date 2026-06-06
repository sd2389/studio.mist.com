"""Catalog read routes — thin HTTP layer delegating to catalog services."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.features.catalog import gems_service, metals_service, scenes_service
from app.schemas.catalog import (
    BackgroundItem,
    CatalogPage,
    EnvironmentItem,
    GemItem,
    GroundItem,
    MetalItem,
    ScenePresetItem,
)

router = APIRouter()


@router.get("/metals", response_model=CatalogPage[MetalItem])
def get_metals(
    category: str | None = Query(default=None),
    family: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> CatalogPage[MetalItem]:
    return metals_service.list_metals(
        db, category=category, family=family, limit=limit, offset=offset
    )


@router.get("/gems", response_model=CatalogPage[GemItem])
def get_gems(
    gem_family: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> CatalogPage[GemItem]:
    return gems_service.list_gems(db, gem_family=gem_family, limit=limit, offset=offset)


@router.get("/environments", response_model=CatalogPage[EnvironmentItem])
def get_environments(
    env_type: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> CatalogPage[EnvironmentItem]:
    return scenes_service.list_environments(
        db, env_type=env_type, limit=limit, offset=offset
    )


@router.get("/backgrounds", response_model=CatalogPage[BackgroundItem])
def get_backgrounds(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> CatalogPage[BackgroundItem]:
    return scenes_service.list_backgrounds(db, limit=limit, offset=offset)


@router.get("/grounds", response_model=CatalogPage[GroundItem])
def get_grounds(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> CatalogPage[GroundItem]:
    return scenes_service.list_grounds(db, limit=limit, offset=offset)


@router.get("/scene-presets", response_model=CatalogPage[ScenePresetItem])
def get_scene_presets(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> CatalogPage[ScenePresetItem]:
    return scenes_service.list_scene_presets(db, limit=limit, offset=offset)
