"""Upload flows: ingest config merge, persist scene metadata, store bytes.

Every stored model is binary glTF 2.0, checked by its bytes; its triangles are counted from
the file, never taken from the client. A bulk upload's designs become scenes the same way
(create_scene_from_glb), once a worker has converted them.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import storage
from app.core.cache_policy import cache_control_for_key
from app.core import storage_keys as keys
from app.core.adapters.errors import StorageObjectTooLargeError
from app.core.observability import get_logger, log_event
from app.features.publish import service as publish_service
from app.features.scene.skus import SKU_TAKEN, assert_sku_available
from app.features.upload.thumbnails import CheckedThumbnail, read_checked_thumbnail
from app.features.billing.quota_service import (
    assert_model_credit,
    assert_polygon_limit,
    assert_storage_for_upload,
    consume_model_credit,
)
from app.models.billing import UserBilling
from app.models.scene import Scene
from app.models.user import User
from app.services import glb
from app.services.model_config import (
    build_scene_settings_config,
    build_slot_material_config,
    merge_scene_settings,
    merge_slot_material_config,
)

logger = get_logger("studio.upload")

GLB_CONTENT_TYPE = "model/gltf-binary"
NOT_GLB_DETAIL = "Models must be GLB; the studio's upload page converts CAD files for you."

# Mirrors SUPPORTED_MODEL_EXTS in src/lib/model-key.ts. These names only pick the key; the
# browser converts every one of them to GLB first, and the server checks the bytes.
SUPPORTED_MODEL_SUFFIXES = (
    ".glb",
    ".gltf",
    ".3dm",
    ".step",
    ".stp",
    ".iges",
    ".igs",
    ".obj",
    ".fbx",
    ".stl",
    ".ply",
    ".3mf",
)
CANONICAL_MODEL_SUFFIX = ".glb"


def model_suffix(name: str | None) -> str:
    return Path(name or "").suffix.lower()


def is_supported_model_filename(name: str | None) -> bool:
    return model_suffix(name) in SUPPORTED_MODEL_SUFFIXES


def require_supported_model_filename(name: str | None) -> None:
    if not is_supported_model_filename(name):
        supported = ", ".join(suffix.lstrip(".") for suffix in SUPPORTED_MODEL_SUFFIXES)
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model format '{model_suffix(name) or 'none'}'. Supported: {supported}",
        )


def safe_filename(name: str, *, force_glb: bool = False) -> str:
    base = Path(name or "model.glb").name
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(base).stem)[:120] or "model"
    if force_glb:
        return f"{stem}{CANONICAL_MODEL_SUFFIX}"
    suf = Path(base).suffix.lower()
    if suf not in SUPPORTED_MODEL_SUFFIXES:
        suf = CANONICAL_MODEL_SUFFIX
    return f"{stem}{suf}"


def safe_thumbnail_filename(name: str = "thumbnail.webp") -> str:
    base = Path(name or "thumbnail.webp").name
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(base).stem)[:120] or "thumbnail"
    return f"{stem}.webp"


def display_name_from_key(key: str) -> str:
    base = Path(key).stem
    base = re.sub(r"^[0-9a-f]{12,}-", "", base)
    cleaned = re.sub(r"[-_]+", " ", base).strip()
    return cleaned.title() or "Untitled"


def parse_json_object(raw: Any, field_name: str) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid JSON in {field_name}") from exc
        if isinstance(parsed, dict):
            return parsed
    raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON object")


def build_ingest_configs(filename: str, payload: bytes) -> tuple[dict, dict]:
    slot_config = build_slot_material_config(filename, payload)
    scene_config = build_scene_settings_config()
    return slot_config, scene_config


def _upload_too_large(max_bytes: int) -> HTTPException:
    return HTTPException(
        status_code=413,
        detail=f"File exceeds maximum upload size ({max_bytes // (1024 * 1024)} MB)",
    )


def require_upload_size(byte_count: int) -> None:
    max_bytes = get_settings().max_upload_bytes
    if byte_count > max_bytes:
        raise _upload_too_large(max_bytes)


def count_model_triangles(payload: bytes) -> int:
    """Triangles the model draws, counted from its own bytes. Anything else is refused:
    415 for another format (CAD, OBJ, glTF JSON, a renamed file), 422 for a GLB that is cut
    short, malformed, or draws no triangles."""
    try:
        triangles = glb.count_glb_triangles(payload)
    except glb.NotGlbError as exc:
        raise HTTPException(status_code=415, detail=NOT_GLB_DETAIL) from exc
    except glb.BrokenGlbError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"This GLB can't be read: {exc}. Try the upload again from the studio's upload page.",
        ) from exc
    if triangles < 1:
        raise HTTPException(status_code=422, detail="This GLB draws no triangles, so there is nothing to show.")
    return triangles


def assert_model_fits_plan(db: Session, user: User, model_bytes: bytes, upload_bytes: int) -> UserBilling:
    """What every model passes before it is stored, in this order: real GLB (415 / 422),
    triangles within the plan (402), room in storage (402), a model credit left (402).
    Returns the billing row the credit is then taken from."""
    assert_polygon_limit(db, user, count_model_triangles(model_bytes))
    assert_storage_for_upload(db, user, upload_bytes)
    return assert_model_credit(db, user)


# What pays for a new scene, in the same commit as its save. It gets the scene once it has an
# id, takes its model credit and counts its storage, and raises to refuse the save.
PayForScene = Callable[[Scene], None]


@dataclass(frozen=True)
class SceneDetails:
    """What a new scene is called and filed under, and the look it starts from, as the upload
    page, or a bulk upload's converter and look template, give them."""

    name: str | None = None
    sku: str | None = None
    category: str | None = None
    note: str | None = None
    material: str = "original"
    lighting: str = "studio"
    model_config: dict | None = None
    slot_selections: dict[str, str] | None = None
    scene_settings: dict[str, Any] | None = None


def save_new_scene(db: Session, scene: Scene, pay: PayForScene) -> None:
    """Save the scene and what pays for it in one commit: a refused charge leaves no scene
    behind, and a save that fails takes no credit. A save that took the same SKU after this
    one's check wins at the unique index: that is a 409, as the check's."""
    sku = scene.sku
    db.add(scene)
    try:
        db.flush()  # the SKU's unique index, and the id `pay` may record
        pay(scene)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if sku:
            raise HTTPException(status_code=409, detail=SKU_TAKEN) from exc
        raise
    except Exception:
        db.rollback()
        raise
    db.refresh(scene)


def pay_with_model_credit(db: Session, billing: UserBilling, upload_bytes: int) -> PayForScene:
    """What pays for an uploaded scene: a model credit from the balance, and its storage."""
    return lambda _scene: consume_model_credit(db, billing, upload_bytes)


def store_model_scene(
    db: Session,
    scene: Scene,
    model_bytes: bytes,
    pay: PayForScene,
    thumbnail: CheckedThumbnail | None = None,
) -> None:
    """Write the checked model (and thumbnail) at the scene's keys, save the scene with what
    pays for it, then publish it. A save that fails takes the written objects away again."""
    written = [scene.model_key]
    try:
        storage.write_bytes(scene.model_key, model_bytes, content_type=GLB_CONTENT_TYPE)
        if thumbnail is not None:
            written.append(thumbnail.key)
            storage.write_bytes(thumbnail.key, thumbnail.data, content_type=thumbnail.content_type)
        save_new_scene(db, scene, pay)
    except Exception:
        for key in written:
            storage.delete_quietly(key)
        raise
    publish_service.publish_scene(db, scene)


def create_scene_from_glb(
    db: Session,
    user: User,
    *,
    model_key: str,
    model_bytes: bytes,
    details: SceneDetails,
    pay: PayForScene,
    thumbnail: CheckedThumbnail | None = None,
) -> Scene:
    """Make a scene of a checked GLB, as every upload does: its slots and scene settings read
    from the model and merged with what `details` gives, the model (and thumbnail) written at
    the scene's keys, the scene saved with `pay` in one commit, then published under its SKU.

    The caller has already checked the model's bytes against the plan and the SKU.
    """
    inferred_slots, inferred_scene = build_ingest_configs(model_key, model_bytes)
    model_config = merge_slot_material_config(inferred_slots, details.model_config)
    now = datetime.utcnow()
    scene = Scene(
        model_key=model_key,
        material=details.material,
        name=details.name or display_name_from_key(model_key),
        sku=details.sku or None,
        category=details.category,
        note=details.note,
        lighting=details.lighting,
        model_config=model_config,
        slot_selections=details.slot_selections or dict(model_config.get("defaultMaterials") or {}),
        scene_settings=merge_scene_settings(inferred_scene, details.scene_settings),
        thumbnail_key=thumbnail.key if thumbnail else None,
        user_id=user.id,
        project_id=1,
        created_at=now,
        updated_at=now,
    )
    store_model_scene(db, scene, model_bytes, pay, thumbnail)
    return scene


def read_stored_upload(key: str) -> bytes:
    """A presigned upload's bytes. One over the upload cap is refused (413) without reading it."""
    max_bytes = get_settings().max_upload_bytes
    try:
        return storage.read_bytes(key, max_bytes=max_bytes)
    except StorageObjectTooLargeError as exc:
        raise _upload_too_large(max_bytes) from exc


def _scene_uses(db: Session, column: Any, key: str) -> bool:
    return db.execute(select(Scene.id).where(column == key)).first() is not None


def _require_own_upload_keys(user_id: int, key: str, thumbnail_key: str | None) -> None:
    try:
        keys.reject_unsafe_key(key)
        if thumbnail_key is not None:
            keys.reject_unsafe_key(thumbnail_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid storage key") from exc
    if not keys.key_belongs_to_user(key, user_id) or not key.startswith(
        f"{keys.customer_models_prefix(user_id)}/"
    ):
        raise HTTPException(status_code=400, detail="key must be under your customer models prefix")
    if not key.lower().endswith(CANONICAL_MODEL_SUFFIX):
        raise HTTPException(status_code=400, detail="model key must end with .glb")
    # Register deletes the presigned thumbnail, so it must be one: never a model, render or asset.
    if thumbnail_key is not None and not thumbnail_key.startswith(f"{keys.customer_thumbnails_prefix(user_id)}/"):
        raise HTTPException(status_code=400, detail="thumbnail_key must be under your customer thumbnails prefix")


_UPLOAD_KEY_PREFIX = re.compile(r"^[0-9a-f]{32}-")


def _key_for_checked_model(user_id: int, upload_key: str) -> str:
    """A new key, with the same file name, for a presigned upload's checked bytes."""
    return keys.model_key(user_id, _UPLOAD_KEY_PREFIX.sub("", Path(upload_key).name))


def register_after_presign(
    db: Session,
    *,
    user: User,
    key: str,
    name: str | None = None,
    sku: str | None = None,
    category: str | None = None,
    note: str | None = None,
    thumbnail_key: str | None = None,
    material: str,
    model_config_data: dict | None,
    slot_selections: dict[str, str] | None,
    scene_settings: dict[str, Any] | None,
) -> dict[str, int | str]:
    """Save a model the browser uploaded through a presigned URL, with its optional thumbnail.

    Both uploaded objects are checked from their own bytes, then deleted whether the save
    succeeds or not. Checked bytes are written under fresh keys: a presigned URL can overwrite
    its object until it expires, so no scene may point at one. A bad model is refused; a bad
    thumbnail is dropped and the model saved without it.
    """
    _require_own_upload_keys(user.id, key, thumbnail_key)
    if _scene_uses(db, Scene.model_key, key):
        raise HTTPException(status_code=409, detail="This model is already saved.")
    if thumbnail_key and _scene_uses(db, Scene.thumbnail_key, thumbnail_key):
        # A scene saved before thumbnails were copied shows this very object: leave it be.
        log_event(logger, "upload.thumbnail_dropped", key=thumbnail_key, reason="a saved scene uses it")
        thumbnail_key = None
    try:
        return _register_checked_upload(
            db,
            user=user,
            upload_key=key,
            name=name,
            sku=sku,
            category=category,
            note=note,
            thumbnail_key=thumbnail_key,
            material=material,
            model_config_data=model_config_data,
            slot_selections=slot_selections,
            scene_settings=scene_settings,
        )
    finally:
        storage.delete_quietly(key)
        if thumbnail_key:
            storage.delete_quietly(thumbnail_key)


def _register_checked_upload(
    db: Session,
    *,
    user: User,
    upload_key: str,
    name: str | None,
    sku: str | None,
    category: str | None,
    note: str | None,
    thumbnail_key: str | None,
    material: str,
    model_config_data: dict | None,
    slot_selections: dict[str, str] | None,
    scene_settings: dict[str, Any] | None,
) -> dict[str, int | str]:
    assert_sku_available(db, sku)
    model_bytes = read_stored_upload(upload_key)
    thumbnail = read_checked_thumbnail(user.id, thumbnail_key)
    upload_bytes = len(model_bytes) + (len(thumbnail.data) if thumbnail else 0)
    billing = assert_model_fits_plan(db, user, model_bytes, upload_bytes)
    scene = create_scene_from_glb(
        db,
        user,
        model_key=_key_for_checked_model(user.id, upload_key),
        model_bytes=model_bytes,
        details=SceneDetails(
            name=name,
            sku=sku,
            category=category,
            note=note,
            material=material,
            model_config=model_config_data,
            slot_selections=slot_selections,
            scene_settings=scene_settings,
        ),
        pay=pay_with_model_credit(db, billing, upload_bytes),
        thumbnail=thumbnail,
    )
    return {"scene_id": scene.id, "model_key": scene.model_key}


def save_direct_multipart(
    db: Session,
    *,
    user: User,
    filename: str,
    body: bytes,
    name: str | None = None,
    sku: str | None = None,
    category: str | None = None,
    note: str | None = None,
    model_config_raw: Any,
    slot_selections_raw: Any,
    scene_settings_raw: Any,
) -> dict[str, int | str]:
    """Save a model sent in the request body. Nothing is written until the bytes are a real
    GLB that fits the plan."""
    require_supported_model_filename(filename)
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")
    require_upload_size(len(body))
    safe_name = safe_filename(filename, force_glb=True)
    key = keys.model_key(user.id, safe_name)

    assert_sku_available(db, sku)
    billing = assert_model_fits_plan(db, user, body, len(body))

    details = SceneDetails(
        name=name,
        sku=sku,
        category=category,
        note=note,
        model_config=parse_json_object(model_config_raw, "model_config") or None,
        slot_selections=parse_json_object(slot_selections_raw, "slot_selections") or None,
        scene_settings=parse_json_object(scene_settings_raw, "scene_settings") or None,
    )
    scene = create_scene_from_glb(
        db,
        user,
        model_key=key,
        model_bytes=body,
        details=details,
        pay=pay_with_model_credit(db, billing, len(body)),
    )
    return {"scene_id": scene.id, "model_key": key}


def presign_upload_url(
    user_id: int, filename: str, content_type: str | None
) -> dict[str, str | int | dict[str, str]]:
    is_image = bool(content_type and content_type.startswith("image/"))
    if is_image:
        safe = safe_thumbnail_filename(filename)
        key = keys.thumbnail_key(user_id, safe)
        ctype = content_type or "image/webp"
    else:
        require_supported_model_filename(filename)
        safe = safe_filename(filename, force_glb=True)
        key = keys.model_key(user_id, safe)
        ctype = content_type or "model/gltf-binary"
    url = storage.presign_put(key, ctype, expires_in=900)
    # The upload must send exactly what the URL signs, or the storage refuses it.
    headers = {"Content-Type": ctype, "Cache-Control": cache_control_for_key(key)}
    return {"upload_url": url, "key": key, "method": "PUT", "expires_in": 900, "headers": headers}
