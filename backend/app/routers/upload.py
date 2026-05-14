import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.scene import Scene
from app.schemas.upload import PresignRequest, RegisterRequest
from app.services.model_config import (
    build_scene_settings_config,
    build_slot_material_config,
    merge_scene_settings,
    merge_slot_material_config,
)

router = APIRouter()


SUPPORTED_MODEL_SUFFIXES = (".glb", ".gltf", ".stl", ".3dm")


def _safe_filename(name: str) -> str:
    base = Path(name or "model.glb").name
    stem = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(base).stem)[:120] or "model"
    suf = Path(base).suffix.lower()
    if suf not in SUPPORTED_MODEL_SUFFIXES:
        suf = ".glb"
    return f"{stem}{suf}"


def _name_from_key(key: str) -> str:
    base = Path(key).stem
    base = re.sub(r"^[0-9a-f]{12,}-", "", base)
    cleaned = re.sub(r"[-_]+", " ", base).strip()
    return cleaned.title() or "Untitled"


def _parse_json_payload(raw: Any, field_name: str) -> dict:
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


def _load_model_bytes_from_storage(key: str) -> bytes:
    settings = get_settings()
    if settings.aws_bucket:
        try:
            client = boto3.client("s3", region_name=settings.aws_region or "us-east-1")
            obj = client.get_object(Bucket=settings.aws_bucket, Key=key)
            stream = obj.get("Body")
            if stream is None:
                raise HTTPException(status_code=404, detail="Uploaded file not found")
            data = stream.read()
            if not data:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")
            return data
        except HTTPException:
            raise
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"Failed to read uploaded model: {exc}") from exc

    source = settings.upload_dir / key
    if not source.exists():
        raise HTTPException(status_code=404, detail="Uploaded file not found")
    data = source.read_bytes()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return data


def _build_ingest_configs(filename: str, payload: bytes) -> tuple[dict, dict]:
    slot_config = build_slot_material_config(filename, payload)
    scene_config = build_scene_settings_config()
    return slot_config, scene_config


@router.post("/presign")
async def presign_upload(body: PresignRequest) -> dict[str, str | int]:
    settings = get_settings()
    if not settings.aws_bucket:
        raise HTTPException(
            status_code=503,
            detail="AWS_BUCKET not set; presigned uploads require S3",
        )
    safe = _safe_filename(body.filename)
    key = f"models/{uuid4().hex}-{safe}"
    ctype = body.content_type or "model/gltf-binary"
    try:
        client = boto3.client("s3", region_name=settings.aws_region or "us-east-1")
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.aws_bucket,
                "Key": key,
                "ContentType": ctype,
            },
            ExpiresIn=900,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"Presign failed: {exc}") from exc

    return {"upload_url": url, "key": key, "method": "PUT", "expires_in": 900}


@router.post("/register")
async def register_upload(
    body: RegisterRequest,
    db: Session = Depends(get_db),
) -> dict[str, int | str]:
    if not body.key.startswith("models/"):
        raise HTTPException(status_code=400, detail="key must start with models/")
    model_bytes = _load_model_bytes_from_storage(body.key)
    inferred_slot_config, inferred_scene_config = _build_ingest_configs(body.key, model_bytes)
    model_config = merge_slot_material_config(inferred_slot_config, body.model_config_data or None)
    scene_settings = merge_scene_settings(inferred_scene_config, body.scene_settings or None)
    slot_selections = body.slot_selections or dict(model_config.get("defaultMaterials") or {})
    now = datetime.utcnow()
    scene = Scene(
        model_key=body.key,
        material=body.material,
        name=_name_from_key(body.key),
        lighting="studio",
        model_config=model_config,
        slot_selections=slot_selections,
        scene_settings=scene_settings,
        project_id=1,
        created_at=now,
        updated_at=now,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return {"scene_id": scene.id, "model_key": body.key}


@router.post("")
async def upload_model(
    file: UploadFile = File(...),
    model_config_body: str | None = Form(default=None, alias="model_config"),
    slot_selections: str | None = Form(default=None),
    scene_settings: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> dict[str, int | str]:
    settings = get_settings()
    safe_name = _safe_filename(file.filename or "model.glb")
    key = f"models/{uuid4().hex}-{safe_name}"

    body = await file.read()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")

    model_config_payload = _parse_json_payload(model_config_body, "model_config")
    slot_selections_payload = _parse_json_payload(slot_selections, "slot_selections")
    scene_settings_payload = _parse_json_payload(scene_settings, "scene_settings")

    inferred_slot_config, inferred_scene_config = _build_ingest_configs(safe_name, body)
    model_config_payload = merge_slot_material_config(inferred_slot_config, model_config_payload or None)
    scene_settings_payload = merge_scene_settings(inferred_scene_config, scene_settings_payload or None)
    if not slot_selections_payload:
        slot_selections_payload = dict(model_config_payload.get("defaultMaterials") or {})

    if settings.aws_bucket:
        try:
            client = boto3.client(
                "s3",
                region_name=settings.aws_region or "us-east-1",
            )
            client.put_object(Bucket=settings.aws_bucket, Key=key, Body=body)
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"S3 upload failed: {exc}") from exc
    else:
        dest = settings.upload_dir / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)

    now = datetime.utcnow()
    scene = Scene(
        model_key=key,
        material="original",
        name=_name_from_key(key),
        lighting="studio",
        model_config=model_config_payload,
        slot_selections=slot_selections_payload,
        scene_settings=scene_settings_payload,
        project_id=1,
        created_at=now,
        updated_at=now,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)

    return {"scene_id": scene.id, "model_key": key}
