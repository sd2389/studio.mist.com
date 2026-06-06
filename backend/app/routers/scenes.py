"""Scene CRUD routes — delegate to scene feature."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.features.scene import service as scene_service
from app.models.user import User
from app.schemas.scene import SceneDetail, SceneListItem, ScenePatch

router = APIRouter()


@router.get("", response_model=list[SceneListItem])
def list_scenes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SceneListItem]:
    return scene_service.list_scenes(db, user.id)


@router.get("/{scene_id}", response_model=SceneDetail)
def get_scene(
    scene_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SceneDetail:
    return scene_service.scene_detail(db, scene_id, user.id)


@router.get("/by-model/{viewer_id:path}", response_model=SceneDetail)
def get_scene_by_model(viewer_id: str, db: Session = Depends(get_db)) -> SceneDetail:
    return scene_service.scene_detail_for_model(db, viewer_id)


@router.get("/by-sku/{sku:path}", response_model=SceneDetail)
def get_scene_by_sku(sku: str, db: Session = Depends(get_db)) -> SceneDetail:
    return scene_service.scene_detail_for_sku(db, sku)


@router.patch("/{scene_id}", response_model=SceneListItem)
def patch_scene(
    scene_id: int,
    body: ScenePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SceneListItem:
    return scene_service.patch_scene_by_id(db, scene_id, user.id, body)


@router.patch("/by-model/{viewer_id:path}", response_model=SceneListItem)
def patch_scene_by_model(
    viewer_id: str,
    body: ScenePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SceneListItem:
    return scene_service.patch_scene_for_model(db, viewer_id, user.id, body)


@router.delete("/{scene_id}")
def delete_scene(
    scene_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool | int]:
    return scene_service.delete_scene_by_id(db, scene_id, user.id)
