"""Scene CRUD routes — delegate to scene feature."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.request_body import read_at_most
from app.database import get_db
from app.features.scene import service as scene_service
from app.features.scene import thumbnail as thumbnail_service
from app.models.user import User
from app.schemas.scene import SceneDetail, SceneListItem, SceneListPage, SceneListQuery, ScenePatch

router = APIRouter()


async def _thumbnail_image(request: Request) -> bytes:
    """The request body: a capture of the studio's view, 413 as soon as it passes the cap."""
    return await read_at_most(request.stream(), thumbnail_service.MAX_THUMBNAIL_BYTES)


@router.get("", response_model=SceneListPage)
def list_scenes(
    query: Annotated[SceneListQuery, Query()],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SceneListPage:
    return scene_service.list_scenes(db, user.id, query)


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


@router.put("/{scene_id}/thumbnail", response_model=SceneListItem)
def put_scene_thumbnail(
    scene_id: int,
    user: User = Depends(get_current_user),
    image: bytes = Depends(_thumbnail_image),
    db: Session = Depends(get_db),
) -> SceneListItem:
    """The thumbnail, from a capture of the studio's live view (ADR 0005): the owner's, free, unmarked."""
    return thumbnail_service.set_scene_thumbnail(db, scene_id, user, image)


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
