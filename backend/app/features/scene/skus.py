"""Who may use a SKU. SKUs are unique across the platform, since the embed URL is
/embed/<SKU>, and case-sensitive."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.scene import Scene

SKU_TAKEN = "SKU already exists"


def assert_sku_available(db: Session, sku: str | None) -> None:
    """409 when a scene already holds `sku`. A blank SKU is no SKU."""
    if sku and db.execute(select(Scene.id).where(Scene.sku == sku)).first() is not None:
        raise HTTPException(status_code=409, detail=SKU_TAKEN)


def commit_new_sku(db: Session) -> None:
    """Commit a scene that just took a SKU. Another save that took the same SKU after the
    check trips the unique index: that is a 409 too, not a 500."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=SKU_TAKEN) from exc
