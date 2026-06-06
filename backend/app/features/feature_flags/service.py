"""Feature flag reads and admin updates."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.feature_flags.registry import FEATURE_REGISTRY, get_definition
from app.models.feature_flag import FeatureFlag
from app.models.user import User
from app.schemas.feature_flags import (
    FeatureFlagRow,
    FeatureFlagsAdminResponse,
    FeatureFlagsSnapshot,
    SetFeatureFlagRequest,
)


def _overrides(db: Session) -> dict[str, FeatureFlag]:
    rows = db.scalars(select(FeatureFlag)).all()
    return {row.key: row for row in rows}


def _enabled_for_key(key: str, overrides: dict[str, FeatureFlag]) -> bool:
    definition = get_definition(key)
    if definition is None:
        return False
    override = overrides.get(key)
    if override is None:
        return definition.default_enabled
    return override.enabled


def snapshot(db: Session) -> FeatureFlagsSnapshot:
    overrides = _overrides(db)
    flags = {feature.key: _enabled_for_key(feature.key, overrides) for feature in FEATURE_REGISTRY}
    return FeatureFlagsSnapshot(flags=flags)


def is_enabled(db: Session, key: str) -> bool:
    return _enabled_for_key(key, _overrides(db))


def list_for_admin(db: Session) -> FeatureFlagsAdminResponse:
    overrides = _overrides(db)
    features: list[FeatureFlagRow] = []
    for definition in FEATURE_REGISTRY:
        override = overrides.get(definition.key)
        features.append(
            FeatureFlagRow(
                key=definition.key,
                label=definition.label,
                description=definition.description,
                category=definition.category,
                default_enabled=definition.default_enabled,
                enabled=_enabled_for_key(definition.key, overrides),
                updated_at=override.updated_at if override else None,
            )
        )
    return FeatureFlagsAdminResponse(features=features)


def set_enabled(
    db: Session,
    key: str,
    *,
    enabled: bool,
    admin: User,
) -> FeatureFlagRow:
    definition = get_definition(key)
    if definition is None:
        raise HTTPException(status_code=404, detail="Unknown feature key")

    row = db.get(FeatureFlag, key)
    now = datetime.utcnow()
    if row is None:
        row = FeatureFlag(
            key=key,
            enabled=enabled,
            updated_at=now,
            updated_by_user_id=admin.id,
        )
        db.add(row)
    else:
        row.enabled = enabled
        row.updated_at = now
        row.updated_by_user_id = admin.id

    db.commit()
    db.refresh(row)

    return FeatureFlagRow(
        key=definition.key,
        label=definition.label,
        description=definition.description,
        category=definition.category,
        default_enabled=definition.default_enabled,
        enabled=row.enabled,
        updated_at=row.updated_at,
    )


def apply_update(db: Session, key: str, body: SetFeatureFlagRequest, admin: User) -> FeatureFlagRow:
    return set_enabled(db, key, enabled=body.enabled, admin=admin)
