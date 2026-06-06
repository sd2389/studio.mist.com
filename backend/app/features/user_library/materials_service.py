"""Custom material CRUD for authenticated users."""

from __future__ import annotations

import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.features.billing.quota_service import assert_custom_material_credit, consume_custom_material_credit
from app.features.user_library import repository, serializers, swatch_service
from app.models.user import User
from app.models.user_library import UserMaterial
from app.schemas.library import (
    CreateUserMaterialRequest,
    LibraryPage,
    UpdateUserMaterialRequest,
    UserMaterialItem,
)

VALID_KINDS = frozenset({"metal", "gem"})


def _slugify(label: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return base[:80] or "custom"


def list_materials(
    db: Session,
    user_id: int,
    *,
    kind: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> LibraryPage[UserMaterialItem]:
    if kind and kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Invalid kind")
    rows, total = repository.list_materials(
        db, user_id, kind=kind, limit=limit, offset=offset
    )
    return LibraryPage[UserMaterialItem](
        items=[serializers.material_to_item(row) for row in rows],
        total=total,
        limit=repository.clamp_limit(limit),
        offset=max(offset, 0),
    )


def create_material(
    db: Session,
    user_id: int,
    body: CreateUserMaterialRequest,
) -> UserMaterialItem:
    if body.kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="kind must be metal or gem")
    if not body.label.strip():
        raise HTTPException(status_code=400, detail="label is required")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    billing = assert_custom_material_credit(db, user)

    slug = repository.unique_material_slug(db, user_id, _slugify(body.label))
    row = UserMaterial(
        user_id=user_id,
        kind=body.kind,
        slug=slug,
        label=body.label.strip(),
        params=body.params or {},
        category=body.category,
        family=body.family,
        gem_family=body.gem_family,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    swatch_service.generate_material_swatch(db, row)
    db.refresh(row)
    consume_custom_material_credit(db, billing)
    return serializers.material_to_item(row)


def update_material(
    db: Session,
    user_id: int,
    material_id: int,
    body: UpdateUserMaterialRequest,
) -> UserMaterialItem:
    row = repository.get_material(db, user_id, material_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Material not found")

    if body.label is not None:
        if not body.label.strip():
            raise HTTPException(status_code=400, detail="label cannot be empty")
        row.label = body.label.strip()
    if body.params is not None:
        row.params = body.params

    db.commit()
    db.refresh(row)

    if body.params is not None:
        swatch_service.generate_material_swatch(db, row)
        db.refresh(row)

    return serializers.material_to_item(row)


def delete_material(db: Session, user_id: int, material_id: int) -> None:
    row = repository.get_material(db, user_id, material_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Material not found")
    db.delete(row)
    db.commit()
