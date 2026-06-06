"""Generic paginated read access for catalog tables.

One job: turn (model, filters, paging) into (rows, total). Services stay free of
SQL boilerplate, so a change to paging/sorting happens in exactly one place.
"""

from typing import Any, TypeVar

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.catalog import CatalogMixin

ModelT = TypeVar("ModelT", bound=CatalogMixin)

MAX_LIMIT = 500


def clamp_limit(limit: int) -> int:
    if limit <= 0:
        return 100
    return min(limit, MAX_LIMIT)


def list_active(
    db: Session,
    model: type[ModelT],
    *,
    filters: dict[str, Any] | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[ModelT], int]:
    conditions = [model.is_active.is_(True)]
    for column_name, value in (filters or {}).items():
        if value is None:
            continue
        conditions.append(getattr(model, column_name) == value)

    total = int(
        db.execute(select(func.count(model.id)).where(*conditions)).scalar_one()
    )
    rows = list(
        db.execute(
            select(model)
            .where(*conditions)
            .order_by(model.sort_weight, model.slug)
            .limit(clamp_limit(limit))
            .offset(max(offset, 0))
        )
        .scalars()
        .all()
    )
    return rows, total
