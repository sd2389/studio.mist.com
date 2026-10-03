"""Best-effort publish of scene assets to the public CDN bucket, and the record of it."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.core.observability import get_logger, log_event
from app.models.scene import Scene

_logger = get_logger("studio.publish")

# What a scene's public copies are made from: its SKU, model key and thumbnail key.
PublishedInputs = tuple[str | None, str, str | None]


def publish_scene_to_public(scene: Scene) -> bool:
    """Copy canonical GLB + thumbnail to the public bucket. Never raises."""
    sku = (scene.sku or "").strip()
    if not sku:
        return False

    dest_model = keys.public_model_key(scene.user_id, sku)
    dest_thumb = keys.public_thumbnail_key(scene.user_id, sku) if scene.thumbnail_key else None

    public_backend = storage.get_public_storage()
    backend = public_backend or storage.get_storage()

    try:
        if public_backend is not None:
            public_backend.copy_object(scene.model_key, dest_model)
            if scene.thumbnail_key and dest_thumb:
                public_backend.copy_object(scene.thumbnail_key, dest_thumb)
        else:
            backend.copy_object(scene.model_key, dest_model)
            if scene.thumbnail_key and dest_thumb:
                backend.copy_object(scene.thumbnail_key, dest_thumb)

        log_event(
            _logger,
            "publish.done",
            scene_id=scene.id,
            user_id=scene.user_id,
            sku=sku,
            model_key=dest_model,
            backend=backend.__class__.__name__,
        )
        return True
    except Exception as exc:
        log_event(
            _logger,
            "publish.failed",
            scene_id=scene.id,
            user_id=scene.user_id,
            sku=sku,
            error=str(exc),
        )
        return False


def publish_scene(db: Session, scene: Scene) -> bool:
    """Publish the scene and record it: `published_at` is set when its copies were made and
    cleared when they could not be, or when it has no SKU."""
    published = publish_scene_to_public(scene)
    scene.published_at = datetime.utcnow() if published else None
    db.commit()
    return published


def published_inputs(scene: Scene) -> PublishedInputs:
    return scene.sku, scene.model_key, scene.thumbnail_key


def republish_if_changed(db: Session, scene: Scene, before: PublishedInputs) -> None:
    """Publish again only when the SKU, model or thumbnail changed since `before`, or when a
    scene with a SKU has no copies yet because its last publish failed. Otherwise, as on most
    saves, nothing is copied."""
    has_sku = bool((scene.sku or "").strip())
    if published_inputs(scene) != before or (has_sku and scene.published_at is None):
        publish_scene(db, scene)


def published_copies_exist(scene: Scene) -> bool:
    """Whether the scene's public model, and its thumbnail if it has one, are where publishing
    puts them."""
    sku = (scene.sku or "").strip()
    wanted = [keys.public_model_key(scene.user_id, sku)]
    if scene.thumbnail_key:
        wanted.append(keys.public_thumbnail_key(scene.user_id, sku))
    public_backend = storage.get_public_storage()
    if public_backend is not None:
        return all(public_backend.public_exists(key) for key in wanted)
    backend = storage.get_storage()
    return all(backend.exists(key) for key in wanted)


def check_published_scenes(db: Session) -> dict[str, int]:
    """Bring `published_at` in line with storage for every scene with a SKU: kept where its
    copies exist, published again where they don't. `updated_at` is left as it was."""
    counts = {"published": 0, "republished": 0, "failed": 0}
    now = datetime.utcnow()
    scenes = db.execute(select(Scene).where(func.trim(func.coalesce(Scene.sku, "")) != "")).scalars().all()
    for scene in scenes:
        if published_copies_exist(scene):
            outcome, published_at = "published", scene.published_at or now
        elif publish_scene_to_public(scene):
            outcome, published_at = "republished", now
        else:
            outcome, published_at = "failed", None
        counts[outcome] += 1
        db.execute(
            update(Scene)
            .where(Scene.id == scene.id)
            .values(published_at=published_at, updated_at=Scene.updated_at)
            .execution_options(synchronize_session=False)
        )
    db.commit()
    return counts
