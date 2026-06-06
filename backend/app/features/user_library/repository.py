"""User library data access."""

from typing import Any, TypeVar

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.user_library import UserAsset, UserMaterial

ModelT = TypeVar("ModelT", bound=UserMaterial | UserAsset)

MAX_LIMIT = 200


def clamp_limit(limit: int) -> int:
    if limit <= 0:
        return 50
    return min(limit, MAX_LIMIT)


def list_materials(
    db: Session,
    user_id: int,
    *,
    kind: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[UserMaterial], int]:
    conditions = [UserMaterial.user_id == user_id]
    if kind:
        conditions.append(UserMaterial.kind == kind)

    total = int(
        db.execute(select(func.count(UserMaterial.id)).where(*conditions)).scalar_one()
    )
    rows = list(
        db.execute(
            select(UserMaterial)
            .where(*conditions)
            .order_by(UserMaterial.sort_weight, UserMaterial.created_at.desc())
            .limit(clamp_limit(limit))
            .offset(max(offset, 0))
        )
        .scalars()
        .all()
    )
    return rows, total


def get_material(db: Session, user_id: int, material_id: int) -> UserMaterial | None:
    return db.execute(
        select(UserMaterial).where(
            UserMaterial.id == material_id,
            UserMaterial.user_id == user_id,
        )
    ).scalar_one_or_none()


def list_assets(
    db: Session,
    user_id: int,
    *,
    asset_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[UserAsset], int]:
    conditions = [UserAsset.user_id == user_id]
    if asset_type:
        conditions.append(UserAsset.asset_type == asset_type)

    total = int(
        db.execute(select(func.count(UserAsset.id)).where(*conditions)).scalar_one()
    )
    rows = list(
        db.execute(
            select(UserAsset)
            .where(*conditions)
            .order_by(UserAsset.created_at.desc())
            .limit(clamp_limit(limit))
            .offset(max(offset, 0))
        )
        .scalars()
        .all()
    )
    return rows, total


def get_asset(db: Session, user_id: int, asset_id: int) -> UserAsset | None:
    return db.execute(
        select(UserAsset).where(
            UserAsset.id == asset_id,
            UserAsset.user_id == user_id,
        )
    ).scalar_one_or_none()


def unique_material_slug(db: Session, user_id: int, base: str) -> str:
    slug = base[:80] or "custom"
    candidate = slug
    n = 2
    while db.execute(
        select(UserMaterial.id).where(
            UserMaterial.user_id == user_id,
            UserMaterial.slug == candidate,
        )
    ).scalar_one_or_none():
        candidate = f"{slug}-{n}"
        n += 1
    return candidate
