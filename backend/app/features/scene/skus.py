"""Who may use a SKU. SKUs are unique across the platform, since the embed URL is
/embed/<SKU>, and case-sensitive. A scene holds its SKU; a bulk upload's design reserves its own
while it is in progress, until its scene holds it (docs/adr/0006-bulk-pipeline.md, "SKUs")."""

from __future__ import annotations

from collections.abc import Collection, Iterable
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.ingest import FINISHED_ITEM_STATUSES, IngestItem
from app.models.scene import Scene

SKU_TAKEN = "SKU already exists"
SKU_RESERVED = "SKU is reserved by a bulk upload in progress"
# SKUs looked up in one IN list.
_LOOKUP_CHUNK = 500

SkuHolder = Literal["taken", "reserved"]


def sku_holders(db: Session, skus: Iterable[str], *, except_item_ids: Collection[int] = ()) -> dict[str, SkuHolder]:
    """Which of `skus` a scene holds ("taken") or a design in progress reserves ("reserved"),
    leaving out the designs `except_item_ids`; free ones are absent. Two queries a 500 SKUs."""
    wanted = sorted({sku for sku in skus if sku})
    holders: dict[str, SkuHolder] = {}
    for start in range(0, len(wanted), _LOOKUP_CHUNK):
        chunk = wanted[start : start + _LOOKUP_CHUNK]
        reserving = select(IngestItem.sku).where(
            IngestItem.sku.in_(chunk), IngestItem.status.not_in(FINISHED_ITEM_STATUSES)
        )
        if except_item_ids:
            reserving = reserving.where(IngestItem.id.not_in(except_item_ids))
        holders.update((sku, "reserved") for sku in db.execute(reserving).scalars())
        holders.update((sku, "taken") for sku in db.execute(select(Scene.sku).where(Scene.sku.in_(chunk))).scalars())
    return holders


def assert_sku_available(db: Session, sku: str | None, item_id: int | None = None) -> None:
    """409 when a scene holds `sku`, or a design in progress other than `item_id` reserves it.
    A blank SKU is no SKU."""
    if not sku:
        return
    holder = sku_holders(db, [sku], except_item_ids=() if item_id is None else (item_id,)).get(sku)
    if holder is not None:
        raise HTTPException(status_code=409, detail=SKU_TAKEN if holder == "taken" else SKU_RESERVED)


def commit_new_sku(db: Session) -> None:
    """Commit a scene that just took a SKU. Another save that took the same SKU after the
    check trips the unique index: that is a 409 too, not a 500."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=SKU_TAKEN) from exc
