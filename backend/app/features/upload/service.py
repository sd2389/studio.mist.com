"""Upload flows: ingest config merge, persist scene metadata, store bytes."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.features.publish import service as publish_service
from app.features.billing.quota_service import (
    add_storage_bytes,
    assert_model_credit,
    assert_storage_for_upload,
    consume_model_credit,
)
from app.models.scene import Scene
from app.models.user import User
from app.services.model_config import (
    build_scene_settings_config,
    build_slot_material_config,
    merge_scene_settings,
    merge_slot_material_config,
)

SUPPORTED_MODEL_SUFFIXES = (".glb", ".gltf", ".stl", ".3dm")
CANONICAL_MODEL_SUFFIX = ".glb"


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


def _total_upload_bytes(model_bytes: int, thumbnail_key: str | None) -> int:
    total = len(model_bytes)
    if thumbnail_key:
        try:
            total += len(storage.read_bytes(thumbnail_key))
        except OSError:
            pass
    return total


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
    try:
        keys.reject_unsafe_key(key)
        if thumbnail_key is not None:
            keys.reject_unsafe_key(thumbnail_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid storage key") from exc
    if not keys.key_belongs_to_user(key, user.id) or not key.startswith(
        f"{keys.customer_models_prefix(user.id)}/"
    ):
        raise HTTPException(status_code=400, detail="key must be under your customer models prefix")
    if not key.lower().endswith(CANONICAL_MODEL_SUFFIX):
        raise HTTPException(status_code=400, detail="model key must end with .glb")
    if thumbnail_key is not None and not keys.key_belongs_to_user(thumbnail_key, user.id):
        raise HTTPException(status_code=400, detail="thumbnail_key must be under your customer prefix")
    if sku:
        existing = db.execute(select(Scene).where(Scene.sku == sku)).scalars().first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="SKU already exists")

    model_bytes = storage.read_bytes(key)
    upload_bytes = _total_upload_bytes(model_bytes, thumbnail_key)
    assert_storage_for_upload(db, user, upload_bytes)
    billing = assert_model_credit(db, user)
    inferred_slots, inferred_scene = build_ingest_configs(key, model_bytes)
    model_config = merge_slot_material_config(inferred_slots, model_config_data)
    merged_scene = merge_scene_settings(inferred_scene, scene_settings)
    selections = slot_selections or dict(model_config.get("defaultMaterials") or {})
    now = datetime.utcnow()
    scene = Scene(
        model_key=key,
        material=material,
        name=name or display_name_from_key(key),
        sku=sku,
        category=category,
        note=note,
        lighting="studio",
        model_config=model_config,
        slot_selections=selections,
        scene_settings=merged_scene,
        thumbnail_key=thumbnail_key,
        user_id=user.id,
        project_id=1,
        created_at=now,
        updated_at=now,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    consume_model_credit(db, billing)
    add_storage_bytes(db, billing, upload_bytes)
    publish_service.publish_scene_to_public(scene)
    return {"scene_id": scene.id, "model_key": key}


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
    safe_name = safe_filename(filename, force_glb=True)
    key = keys.model_key(user.id, safe_name)

    if sku:
        existing = db.execute(select(Scene).where(Scene.sku == sku)).scalars().first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="SKU already exists")

    assert_storage_for_upload(db, user, len(body))
    billing = assert_model_credit(db, user)

    model_config_payload = parse_json_object(model_config_raw, "model_config")
    slot_selections_payload = parse_json_object(slot_selections_raw, "slot_selections")
    scene_settings_payload = parse_json_object(scene_settings_raw, "scene_settings")

    inferred_slots, inferred_scene = build_ingest_configs(safe_name, body)
    model_config_payload = merge_slot_material_config(inferred_slots, model_config_payload or None)
    scene_settings_payload = merge_scene_settings(inferred_scene, scene_settings_payload or None)
    if not slot_selections_payload:
        slot_selections_payload = dict(model_config_payload.get("defaultMaterials") or {})

    storage.write_bytes(key, body)

    now = datetime.utcnow()
    scene = Scene(
        model_key=key,
        material="original",
        name=name or display_name_from_key(key),
        sku=sku,
        category=category,
        note=note,
        lighting="studio",
        model_config=model_config_payload,
        slot_selections=slot_selections_payload,
        scene_settings=scene_settings_payload,
        user_id=user.id,
        project_id=1,
        created_at=now,
        updated_at=now,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    consume_model_credit(db, billing)
    add_storage_bytes(db, billing, len(body))
    publish_service.publish_scene_to_public(scene)
    return {"scene_id": scene.id, "model_key": key}


def presign_upload_url(
    user_id: int, filename: str, content_type: str | None
) -> dict[str, str | int]:
    is_image = bool(content_type and content_type.startswith("image/"))
    if is_image:
        safe = safe_thumbnail_filename(filename)
        key = keys.thumbnail_key(user_id, safe)
        ctype = content_type or "image/webp"
    else:
        safe = safe_filename(filename, force_glb=True)
        key = keys.model_key(user_id, safe)
        ctype = content_type or "model/gltf-binary"
    url = storage.presign_put(key, ctype, expires_in=900)
    return {"upload_url": url, "key": key, "method": "PUT", "expires_in": 900}
