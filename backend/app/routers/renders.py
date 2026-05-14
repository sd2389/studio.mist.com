import base64
import re
from datetime import datetime
from uuid import uuid4

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Render, Scene
from app.schemas.render import RenderSaveRequest
from app.schemas.scene import RenderItem
from app.services.ai_background import public_file_url

router = APIRouter()

_DATA_URL = re.compile(r"^data:image/(png|jpeg|jpe|jpg);base64,([A-Za-z0-9+/=]+)$", re.IGNORECASE)


def _normalized_model_key(model_id: str) -> str:
    trimmed = model_id.strip().lstrip("/")
    if trimmed.startswith("models/"):
        return trimmed
    return f"models/{trimmed}"


def _resolve_scene_for_render(
    db: Session,
    scene_id: int | None,
    model_id: str | None,
) -> Scene | None:
    if scene_id is not None:
        return db.get(Scene, scene_id)
    if not model_id:
        return None
    model_key = _normalized_model_key(model_id)
    return db.execute(
        select(Scene)
        .where(Scene.model_key == model_key)
        .order_by(Scene.updated_at.desc(), Scene.id.desc())
    ).scalars().first()


@router.post("")
async def save_render(
    body: RenderSaveRequest,
    db: Session = Depends(get_db),
) -> dict[str, bool | str | int | None]:
    m = _DATA_URL.match(body.image.strip())
    if not m:
        raise HTTPException(status_code=400, detail="Expected data:image/png or jpeg;base64,...")

    kind_ext = m.group(1).lower()
    ext = "jpg" if kind_ext in ("jpeg", "jpe", "jpg") else "png"
    mime = "image/jpeg" if ext == "jpg" else "image/png"

    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 payload") from exc

    if not raw:
        raise HTTPException(status_code=400, detail="Empty image")

    key = f"renders/{uuid4().hex}.{ext}"
    settings = get_settings()

    if settings.aws_bucket:
        try:
            client = boto3.client("s3", region_name=settings.aws_region or "us-east-1")
            client.put_object(
                Bucket=settings.aws_bucket,
                Key=key,
                Body=raw,
                ContentType=mime,
            )
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"S3 upload failed: {exc}") from exc
    else:
        dest = settings.upload_dir / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)

    render_id: int | None = None
    scene = _resolve_scene_for_render(db, body.scene_id, body.model_id)
    if scene is not None:
        render = Render(
            scene_id=scene.id,
            key=key,
            bytes=len(raw),
            kind=body.kind,
            material=body.material,
            lighting=body.lighting,
            width=body.width,
            height=body.height,
            created_at=datetime.utcnow(),
        )
        db.add(render)

        if body.kind in ("still", "hires"):
            scene.thumbnail_key = key
        if body.material is not None:
            scene.material = body.material
        if body.lighting is not None:
            scene.lighting = body.lighting
        scene.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(render)
        render_id = render.id
    elif body.scene_id is not None:
        raise HTTPException(status_code=404, detail="Scene not found")

    return {
        "ok": True,
        "key": key,
        "bytes": len(raw),
        "render_id": render_id,
        "url": public_file_url(key),
    }


@router.get("", response_model=list[RenderItem])
def list_renders(
    scene_id: int = Query(...),
    db: Session = Depends(get_db),
) -> list[RenderItem]:
    rows = db.execute(
        select(Render).where(Render.scene_id == scene_id).order_by(Render.created_at.desc())
    ).scalars().all()
    return [
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
        for r in rows
    ]
