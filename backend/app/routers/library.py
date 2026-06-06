"""User library HTTP routes — custom materials and uploaded assets."""

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_feature
from app.database import get_db
from app.features.user_library import assets_service, materials_service
from app.models.user import User
from app.schemas.library import (
    CreateUserMaterialRequest,
    LibraryPage,
    UpdateUserMaterialRequest,
    UserAssetItem,
    UserMaterialItem,
)

router = APIRouter(dependencies=[Depends(require_feature("library"))])


@router.get("/materials", response_model=LibraryPage[UserMaterialItem])
def get_materials(
    kind: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LibraryPage[UserMaterialItem]:
    return materials_service.list_materials(db, user.id, kind=kind, limit=limit, offset=offset)


@router.post("/materials", response_model=UserMaterialItem)
def create_material(
    body: CreateUserMaterialRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserMaterialItem:
    return materials_service.create_material(db, user.id, body)


@router.patch("/materials/{material_id}", response_model=UserMaterialItem)
def update_material(
    material_id: int,
    body: UpdateUserMaterialRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserMaterialItem:
    return materials_service.update_material(db, user.id, material_id, body)


@router.delete("/materials/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    materials_service.delete_material(db, user.id, material_id)
    return {"ok": True}


@router.get("/assets", response_model=LibraryPage[UserAssetItem])
def get_assets(
    asset_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LibraryPage[UserAssetItem]:
    return assets_service.list_assets(db, user.id, asset_type=asset_type, limit=limit, offset=offset)


@router.post("/assets/upload", response_model=UserAssetItem)
async def upload_asset(
    file: UploadFile = File(...),
    asset_type: str = Form(...),
    label: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserAssetItem:
    return assets_service.upload_asset(
        db, user.id, file=file, asset_type=asset_type, label=label
    )


@router.delete("/assets/{asset_id}")
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    assets_service.delete_asset(db, user.id, asset_id)
    return {"ok": True}
