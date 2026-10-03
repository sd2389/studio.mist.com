"""Deleting a scene: its row, its stored files, and the storage its upload counted."""

from __future__ import annotations

from sqlalchemy import select, union_all
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.features.billing.quota_service import get_or_create_billing, release_storage_bytes
from app.features.publish import service as publish_service
from app.models import Render, Scene


def counted_keys(scene: Scene, render_keys: list[str]) -> list[str]:
    """The files the scene's upload counted toward storage: its model and the thumbnail it
    came with. A render made the thumbnail later was never counted."""
    counted = [scene.model_key]
    if scene.thumbnail_key and scene.thumbnail_key not in render_keys:
        counted.append(scene.thumbnail_key)
    return counted


def uploaded_thumbnail(db: Session, scene: Scene) -> str | None:
    """The thumbnail the scene's upload came with, which counted toward storage; None when the
    current thumbnail is one of its renders, or there is none."""
    key = scene.thumbnail_key
    if not key:
        return None
    render = db.scalar(select(Render.id).where(Render.scene_id == scene.id, Render.key == key).limit(1))
    return key if render is None else None


def keys_used_elsewhere(db: Session, scene_id: int, candidates: list[str]) -> set[str]:
    """Which of these files another scene still uses, as model, thumbnail or render."""
    others = union_all(
        select(Scene.model_key.label("key")).where(Scene.id != scene_id, Scene.model_key.in_(candidates)),
        select(Scene.thumbnail_key).where(Scene.id != scene_id, Scene.thumbnail_key.in_(candidates)),
        select(Render.key).where(Render.scene_id != scene_id, Render.key.in_(candidates)),
    )
    return set(db.execute(others).scalars())


def published_path_shared(db: Session, scene: Scene) -> bool:
    """Whether another of the owner's scenes publishes to the same path: SKUs that differ only
    in characters a key can't hold (`A B`, `A-B`) share one."""
    path = keys.public_published_prefix(scene.user_id, scene.sku or "")
    others = db.execute(
        select(Scene.sku).where(Scene.user_id == scene.user_id, Scene.id != scene.id, Scene.sku.is_not(None))
    ).scalars()
    return any(sku.strip() and keys.public_published_prefix(scene.user_id, sku) == path for sku in others)


def delete_scene(db: Session, scene: Scene) -> int:
    """Delete the scene with its model, thumbnail, renders and published copies, and give its
    owner back the storage its upload counted. Returns the bytes given back.

    The row and the bytes go first, in one commit; files follow, and one that can't be deleted
    is logged and left rather than leaving a scene whose files are gone. Files another scene
    still uses are kept.
    """
    render_keys = list(db.execute(select(Render.key).where(Render.scene_id == scene.id)).scalars())
    counted = counted_keys(scene, render_keys)
    freed = sum(storage.object_size(key) or 0 for key in counted)
    files = list(dict.fromkeys(counted + render_keys))
    kept = keys_used_elsewhere(db, scene.id, files)
    sku = (scene.sku or "").strip()
    unpublish = bool(sku) and not published_path_shared(db, scene)
    user_id = scene.user_id

    billing = get_or_create_billing(db, scene.user)
    db.delete(scene)
    release_storage_bytes(db, billing, freed)
    db.commit()

    for key in files:
        if key not in kept:
            storage.delete_quietly(key)
    if unpublish:
        publish_service.delete_published_copies(user_id, sku)
    return freed
