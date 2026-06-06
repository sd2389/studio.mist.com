"""Persist viewer renders (still frames, thumbnails)."""

import base64
import re
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.core.model_keys import normalized_model_key
from app.core.observability import get_logger, log_event
from app.core.public_urls import public_file_url
from app.features.scene.service import first_scene_for_model, require_owned_scene
from app.models import Render, Scene
from app.schemas.render import RenderSaveRequest
from app.schemas.scene import RenderItem

_DATA_URL = re.compile(r"^data:image/(png|jpeg|jpe|jpg);base64,([A-Za-z0-9+/=]+)$", re.IGNORECASE)
_logger = get_logger("studio.render")


def resolve_scene_for_render(
    db: Session,
    scene_id: int | None,
    model_id: str | None,
) -> Scene | None:
    if scene_id is not None:
        return db.get(Scene, scene_id)
    if not model_id:
        return None
    model_key = normalized_model_key(model_id)
    return first_scene_for_model(db, model_key)


def save_render_from_data_url(
    db: Session, body: RenderSaveRequest, user_id: int
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

    key = keys.render_key(user_id, ext)
    storage.write_bytes(key, raw, content_type=mime)
    log_event(
        _logger,
        "render.save",
        user_id=user_id,
        scene_id=body.scene_id,
        model_id=body.model_id,
        kind=body.kind,
        bytes=len(raw),
        width=body.width,
        height=body.height,
    )

    render_id: int | None = None
    scene = resolve_scene_for_render(db, body.scene_id, body.model_id)
    if scene is not None:
        require_owned_scene(scene, user_id)
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


def list_renders_for_scene(db: Session, scene_id: int, user_id: int) -> list[RenderItem]:
    require_owned_scene(db.get(Scene, scene_id), user_id)
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
