"""Upload HTTP adapter — delegates to upload feature service."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user, require_feature
from app.core.observability import get_logger, log_event
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.features.upload import service as upload_service
from app.models.user import User
from app.schemas.upload import PresignRequest, RegisterRequest

router = APIRouter(dependencies=[Depends(require_feature("upload"))])
logger = get_logger("studio.upload")

_settings = get_settings()
_presign_limit = rate_limit_dependency(
    "upload.presign",
    max_requests=_settings.rate_limit_upload_presign_per_hour,
    require_auth=True,
)
_register_limit = rate_limit_dependency(
    "upload.register",
    max_requests=_settings.rate_limit_upload_register_per_hour,
    require_auth=True,
)
_direct_limit = rate_limit_dependency(
    "upload.direct",
    max_requests=_settings.rate_limit_upload_direct_per_hour,
    require_auth=True,
)


@router.post("/presign")
async def presign_upload(
    body: PresignRequest,
    _user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_presign_limit)] = None,
) -> dict[str, str | int]:
    log_event(
        logger,
        "upload.presign",
        user_id=_user.id,
        filename=body.filename,
        content_type=body.content_type,
    )
    return upload_service.presign_upload_url(_user.id, body.filename, body.content_type)


@router.post("/register")
async def register_upload(
    body: RegisterRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_register_limit)] = None,
) -> dict[str, int | str]:
    log_event(
        logger,
        "upload.register",
        user_id=user.id,
        key=body.key,
        sku=body.sku,
        has_thumbnail=bool(body.thumbnail_key),
    )
    result = upload_service.register_after_presign(
        db,
        user=user,
        key=body.key,
        name=body.name,
        sku=body.sku,
        category=body.category,
        note=body.note,
        thumbnail_key=body.thumbnail_key,
        material=body.material,
        model_config_data=body.model_config_data or None,
        slot_selections=body.slot_selections or None,
        scene_settings=body.scene_settings or None,
    )
    log_event(logger, "upload.register.done", user_id=user.id, scene_id=result.get("scene_id"))
    return result


@router.post("")
async def upload_model(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    sku: str | None = Form(default=None),
    category: str | None = Form(default=None),
    note: str | None = Form(default=None),
    model_config_body: str | None = Form(default=None, alias="model_config"),
    slot_selections: str | None = Form(default=None),
    scene_settings: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_direct_limit)] = None,
) -> dict[str, int | str]:
    body = await file.read()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")

    max_bytes = get_settings().max_upload_bytes
    if len(body) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum upload size ({max_bytes // (1024 * 1024)} MB)",
        )

    log_event(
        logger,
        "upload.direct",
        user_id=user.id,
        filename=file.filename,
        bytes=len(body),
        sku=sku,
    )
    result = upload_service.save_direct_multipart(
        db,
        user=user,
        filename=file.filename or "model.glb",
        body=body,
        name=name,
        sku=sku,
        category=category,
        note=note,
        model_config_raw=model_config_body,
        slot_selections_raw=slot_selections,
        scene_settings_raw=scene_settings,
    )
    log_event(logger, "upload.direct.done", user_id=user.id, scene_id=result.get("scene_id"))
    return result
