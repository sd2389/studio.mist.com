"""Scene queries, DTO shaping, and patch application."""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.core.model_keys import normalized_model_key
from app.core.public_urls import public_file_url
from app.features.billing.quota_service import assert_variant_limit
from app.features.publish import service as publish_service
from app.features.scene.look import saved_look, scene_look
from app.models import Render, Scene
from app.schemas.scene import RenderItem, SceneDetail, SceneListItem, SceneLook, ScenePatch


def _scene_model_url(scene: Scene) -> str | None:
    if scene.sku:
        published_key = keys.public_model_key(scene.user_id, scene.sku)
        if storage.get_storage().exists(published_key):
            return public_file_url(published_key)
    return public_file_url(scene.model_key) if scene.model_key else None


def _scene_thumbnail_url(scene: Scene) -> str | None:
    if scene.sku:
        published_key = keys.public_thumbnail_key(scene.user_id, scene.sku)
        if storage.get_storage().exists(published_key):
            return public_file_url(published_key)
    return public_file_url(scene.thumbnail_key) if scene.thumbnail_key else None


def to_list_item(scene: Scene, render_count: int) -> SceneListItem:
    return SceneListItem(
        id=scene.id,
        name=scene.name,
        sku=scene.sku,
        category=scene.category,
        note=scene.note,
        model_key=scene.model_key,
        material=scene.material,
        lighting=scene.lighting,
        model_config=scene.model_config or {},
        slot_selections=scene.slot_selections or {},
        scene_settings=scene.scene_settings or {},
        variants=scene.variants or {},
        product_specs=scene.product_specs or {},
        model_url=_scene_model_url(scene),
        thumbnail_key=scene.thumbnail_key,
        thumbnail_url=_scene_thumbnail_url(scene),
        created_at=scene.created_at,
        updated_at=scene.updated_at,
        render_count=render_count,
    )


def to_detail(scene: Scene, renders: list[Render], look: SceneLook) -> SceneDetail:
    return SceneDetail(
        id=scene.id,
        name=scene.name,
        sku=scene.sku,
        category=scene.category,
        note=scene.note,
        model_key=scene.model_key,
        material=scene.material,
        lighting=scene.lighting,
        model_config=scene.model_config or {},
        slot_selections=scene.slot_selections or {},
        scene_settings=scene.scene_settings or {},
        variants=scene.variants or {},
        product_specs=scene.product_specs or {},
        model_url=_scene_model_url(scene),
        thumbnail_key=scene.thumbnail_key,
        thumbnail_url=_scene_thumbnail_url(scene),
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
        look=look,
    )


def apply_patch(scene: Scene, body: ScenePatch) -> None:
    if body.name is not None:
        scene.name = body.name
    if body.sku is not None:
        scene.sku = body.sku or None
    if body.category is not None:
        scene.category = body.category or None
    if body.note is not None:
        scene.note = body.note or None
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
    if body.variants is not None:
        scene.variants = body.variants
    if body.product_specs is not None:
        scene.product_specs = body.product_specs.model_dump()
    scene.updated_at = datetime.utcnow()


def count_variants(variants: object) -> int:
    """Saved variants in a scene's `variants` JSON: `{"activeVariantId": …, "items": [...]}`."""
    items = variants.get("items") if isinstance(variants, dict) else None
    return len(items) if isinstance(items, list) else 0


def assert_variants_fit_plan(db: Session, scene: Scene, body: ScenePatch) -> None:
    """Refuse a patch that adds variants past the owner's plan cap (402).

    A scene already over the cap, e.g. after a downgrade, keeps its variants and can still
    rename, update or remove them; it just cannot grow.
    """
    if body.variants is None:
        return
    count = count_variants(body.variants)
    if count > count_variants(scene.variants):
        assert_variant_limit(db, scene.user, count)


def require_owned_scene(scene: Scene | None, user_id: int) -> Scene:
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    if scene.user_id != user_id:
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene


def first_scene_for_model(db: Session, model_key: str) -> Scene | None:
    exact = db.execute(
        select(Scene)
        .where(Scene.model_key == model_key)
        .order_by(Scene.updated_at.desc(), Scene.id.desc())
    ).scalars().first()
    if exact is not None:
        return exact
    # Existing viewer links contain the upload's unique filename, while storage
    # now includes customers/<id>/models/. Resolve only an unambiguous match.
    if model_key.startswith("models/") and "/" not in model_key[7:]:
        matches = db.execute(select(Scene).where(
            Scene.model_key.startswith("customers/"),
            Scene.model_key.endswith("/" + model_key[7:], autoescape=True),
        ).limit(2)).scalars().all()
        if len(matches) == 1:
            return matches[0]
    return None


def first_scene_for_sku(db: Session, sku: str) -> Scene | None:
    return db.execute(select(Scene).where(Scene.sku == sku)).scalars().first()


def commit_patch(db: Session, scene: Scene, body: ScenePatch) -> SceneListItem:
    assert_variants_fit_plan(db, scene, body)
    apply_patch(scene, body)
    db.commit()
    db.refresh(scene)
    publish_service.publish_scene_to_public(scene)
    render_count = int(
        db.execute(select(func.count(Render.id)).where(Render.scene_id == scene.id)).scalar_one()
    )
    return to_list_item(scene, render_count)


def list_scenes(db: Session, user_id: int) -> list[SceneListItem]:
    rows = db.execute(
        select(Scene, func.count(Render.id))
        .outerjoin(Render, Render.scene_id == Scene.id)
        .where(Scene.user_id == user_id)
        .group_by(Scene.id)
        .order_by(Scene.updated_at.desc())
    ).all()
    return [to_list_item(scene, int(count or 0)) for scene, count in rows]


def load_scene_detail(db: Session, scene: Scene, *, with_renders: bool = True) -> SceneDetail:
    """The scene with everything its saved look draws from, and its renders, newest first.

    Public reads leave the renders out: they include export outputs, which are the owner's.
    """
    renders = []
    if with_renders:
        renders = db.execute(
            select(Render).where(Render.scene_id == scene.id).order_by(Render.created_at.desc())
        ).scalars().all()
    return to_detail(scene, renders, scene_look(db, saved_look(scene), scene.user_id))


def scene_detail(db: Session, scene_id: int, user_id: int) -> SceneDetail:
    return load_scene_detail(db, require_owned_scene(db.get(Scene, scene_id), user_id))


def scene_detail_for_model(db: Session, viewer_id: str) -> SceneDetail:
    scene = first_scene_for_model(db, normalized_model_key(viewer_id))
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    return load_scene_detail(db, scene, with_renders=False)


def scene_detail_for_sku(db: Session, sku: str) -> SceneDetail:
    trimmed = sku.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Invalid SKU")
    scene = first_scene_for_sku(db, trimmed)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    return load_scene_detail(db, scene, with_renders=False)


def patch_scene_by_id(db: Session, scene_id: int, user_id: int, body: ScenePatch) -> SceneListItem:
    scene = require_owned_scene(db.get(Scene, scene_id), user_id)
    return commit_patch(db, scene, body)


def patch_scene_for_model(
    db: Session, viewer_id: str, user_id: int, body: ScenePatch
) -> SceneListItem:
    scene = require_owned_scene(
        first_scene_for_model(db, normalized_model_key(viewer_id)),
        user_id,
    )
    return commit_patch(db, scene, body)


def delete_scene_by_id(db: Session, scene_id: int, user_id: int) -> dict[str, bool | int]:
    scene = require_owned_scene(db.get(Scene, scene_id), user_id)
    db.delete(scene)
    db.commit()
    return {"ok": True, "id": scene_id}
