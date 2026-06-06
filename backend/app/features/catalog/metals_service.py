"""Metal / surface catalog reads."""

from sqlalchemy.orm import Session

from app.features.catalog import repository, serializers
from app.models.catalog import CatalogMetal
from app.schemas.catalog import CatalogPage, MetalItem


def list_metals(
    db: Session,
    *,
    category: str | None = None,
    family: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> CatalogPage[MetalItem]:
    rows, total = repository.list_active(
        db,
        CatalogMetal,
        filters={"category": category, "family": family},
        limit=limit,
        offset=offset,
    )
    return CatalogPage[MetalItem](
        items=[serializers.metal_to_item(row) for row in rows],
        total=total,
        limit=repository.clamp_limit(limit),
        offset=max(offset, 0),
    )
