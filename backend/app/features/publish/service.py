"""Best-effort publish of scene assets to the public CDN bucket."""

from __future__ import annotations

from app.core import storage
from app.core import storage_keys as keys
from app.core.observability import get_logger, log_event
from app.models.scene import Scene

_logger = get_logger("studio.publish")


def publish_scene_to_public(scene: Scene) -> bool:
    """Copy canonical GLB + thumbnail to the public bucket. Never raises."""
    sku = (scene.sku or "").strip()
    if not sku:
        return False

    public_backend = storage.get_public_storage()
    if public_backend is None:
        log_event(_logger, "publish.skipped", scene_id=scene.id, reason="no_public_bucket")
        return False

    try:
        dest_model = keys.public_model_key(scene.user_id, sku)
        public_backend.copy_object(scene.model_key, dest_model)

        if scene.thumbnail_key:
            dest_thumb = keys.public_thumbnail_key(scene.user_id, sku)
            public_backend.copy_object(scene.thumbnail_key, dest_thumb)

        log_event(
            _logger,
            "publish.done",
            scene_id=scene.id,
            user_id=scene.user_id,
            sku=sku,
            model_key=dest_model,
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
