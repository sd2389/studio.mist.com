"""Gem catalog reads."""

from sqlalchemy.orm import Session

from app.features.catalog import repository, serializers
from app.models.catalog import CatalogGem
from app.schemas.catalog import CatalogPage, GemItem


def list_gems(
    db: Session,
    *,
    gem_family: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> CatalogPage[GemItem]:
    rows, total = repository.list_active(
        db,
        CatalogGem,
        filters={"gem_family": gem_family},
        limit=limit,
        offset=offset,
    )
    return CatalogPage[GemItem](
        items=[serializers.gem_to_item(row) for row in rows],
        total=total,
        limit=repository.clamp_limit(limit),
        offset=max(offset, 0),
    )
