from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Render, Scene
from app.schemas.scene import RenderItem, SceneDetail, SceneListItem, ScenePatch
from app.services.ai_background import public_file_url

router = APIRouter()


def _normalized_model_key(viewer_id: str) -> str:
    trimmed = viewer_id.strip().lstrip("/")
    if trimmed.startswith("models/"):
        return trimmed
    return f"models/{trimmed}"


def _scene_list_item(
    scene: Scene,
    render_count: int,
) -> SceneListItem:
    return SceneListItem(
        id=scene.id,
        name=scene.name,
        model_key=scene.model_key,
        material=scene.material,
        lighting=scene.lighting,
        model_config_data=scene.model_config or {},
        slot_selections=scene.slot_selections or {},
        scene_settings=scene.scene_settings or {},
        model_url=public_file_url(scene.model_key) if scene.model_key else None,
        thumbnail_key=scene.thumbnail_key,
        thumbnail_url=public_file_url(scene.thumbnail_key) if scene.thumbnail_key else None,
        created_at=scene.created_at,
        updated_at=scene.updated_at,
        render_count=render_count,
    )


def _scene_detail(
    scene: Scene,
    renders: list[Render],
) -> SceneDetail:
    return SceneDetail(
        id=scene.id,
        name=scene.name,
        model_key=scene.model_key,
        material=scene.material,
        lighting=scene.lighting,
        model_config_data=scene.model_config or {},
        slot_selections=scene.slot_selections or {},
        scene_settings=scene.scene_settings or {},
        model_url=public_file_url(scene.model_key) if scene.model_key else None,
        thumbnail_key=scene.thumbnail_key,
        thumbnail_url=public_file_url(scene.thumbnail_key) if scene.thumbnail_key else None,
        created_at=scene.created_at,
        updated_at=scene.updated_at,
        renders=[
            RenderItem(
                id=r.id,
                scene_id=r.scene_id,
                key=r.key,
                bytes=r.bytes,
                kind=r.kind,
                material=r.material,
                lighting=r.lighting,
                width=r.width,
                height=r.height,
                created_at=r.created_at,
                url=public_file_url(r.key),
            )
            for r in renders
        ],
    )


def _apply_patch(scene: Scene, body: ScenePatch) -> None:
    if body.name is not None:
        scene.name = body.name
    if body.material is not None:
        scene.material = body.material
    if body.lighting is not None:
        scene.lighting = body.lighting
    if body.model_config_data is not None:
        scene.model_config = body.model_config_data
    if body.slot_selections is not None:
        scene.slot_selections = body.slot_selections
    if body.scene_settings is not None:
        scene.scene_settings = body.scene_settings
    scene.updated_at = datetime.utcnow()


def _patch_scene(
    db: Session,
    scene: Scene,
    body: ScenePatch,
) -> SceneListItem:
    _apply_patch(scene, body)
    db.commit()
    db.refresh(scene)

    render_count = int(
        db.execute(
            select(func.count(Render.id)).where(Render.scene_id == scene.id)
        ).scalar_one()
    )
    return _scene_list_item(scene, render_count)


def _first_scene_for_model(
    db: Session,
    model_key: str,
) -> Scene | None:
    return db.execute(
        select(Scene)
        .where(Scene.model_key == model_key)
        .order_by(Scene.updated_at.desc(), Scene.id.desc())
    ).scalars().first()


@router.get("", response_model=list[SceneListItem])
def list_scenes(db: Session = Depends(get_db)) -> list[SceneListItem]:
    rows = db.execute(
        select(Scene, func.count(Render.id))
        .outerjoin(Render, Render.scene_id == Scene.id)
        .group_by(Scene.id)
        .order_by(Scene.updated_at.desc())
    ).all()

    return [_scene_list_item(scene, int(count or 0)) for scene, count in rows]


@router.get("/{scene_id}", response_model=SceneDetail)
def get_scene(scene_id: int, db: Session = Depends(get_db)) -> SceneDetail:
    scene = db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")

    renders = db.execute(
        select(Render).where(Render.scene_id == scene_id).order_by(Render.created_at.desc())
    ).scalars().all()

    return _scene_detail(scene, renders)


@router.get("/by-model/{viewer_id:path}", response_model=SceneDetail)
def get_scene_by_model(viewer_id: str, db: Session = Depends(get_db)) -> SceneDetail:
    scene = _first_scene_for_model(db, _normalized_model_key(viewer_id))
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")

    renders = db.execute(
        select(Render).where(Render.scene_id == scene.id).order_by(Render.created_at.desc())
    ).scalars().all()
    return _scene_detail(scene, renders)


@router.patch("/{scene_id}", response_model=SceneListItem)
def patch_scene(
    scene_id: int,
    body: ScenePatch,
    db: Session = Depends(get_db),
) -> SceneListItem:
    scene = db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")

    return _patch_scene(db, scene, body)


@router.patch("/by-model/{viewer_id:path}", response_model=SceneListItem)
def patch_scene_by_model(
    viewer_id: str,
    body: ScenePatch,
    db: Session = Depends(get_db),
) -> SceneListItem:
    scene = _first_scene_for_model(db, _normalized_model_key(viewer_id))
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    return _patch_scene(db, scene, body)


@router.delete("/{scene_id}")
def delete_scene(scene_id: int, db: Session = Depends(get_db)) -> dict[str, bool | int]:
    scene = db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    db.delete(scene)
    db.commit()
    return {"ok": True, "id": scene_id}
