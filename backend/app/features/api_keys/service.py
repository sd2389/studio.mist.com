"""Making, listing and revoking a user's API keys, from a signed-in session (the profile page).

A key is made only on a plan with API access, while the customer API is on (`bulk_pipeline`),
and at most MAX_ACTIVE_KEYS at a time. Listing and revoking always work, so a key can be taken
back whatever the plan or the flag.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.features.api_keys import keys
from app.features.billing.plans import PlanTier, get_quotas, normalize_tier
from app.features.billing.quota_service import get_or_create_billing
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.api_key import ApiKeyCreate, ApiKeyCreated, ApiKeyList, ApiKeyOut

MAX_ACTIVE_KEYS = 10
_PREFIX_ATTEMPTS = 5


def plan_tier_of(db: Session, user: User) -> PlanTier:
    return normalize_tier(get_or_create_billing(db, user).plan_tier)


def has_api_access(db: Session, user: User) -> bool:
    return get_quotas(plan_tier_of(db, user)).api_access


def is_active(key: ApiKey, now: datetime) -> bool:
    return key.revoked_at is None and (key.expires_at is None or key.expires_at > now)


def _active_key_count(db: Session, user_id: int, now: datetime) -> int:
    return db.scalar(
        select(func.count(ApiKey.id)).where(
            ApiKey.user_id == user_id,
            ApiKey.revoked_at.is_(None),
            or_(ApiKey.expires_at.is_(None), ApiKey.expires_at > now),
        )
    ) or 0


def _unused_prefix(db: Session) -> str:
    for _ in range(_PREFIX_ATTEMPTS):
        prefix = keys.new_prefix()
        if db.scalar(select(ApiKey.id).where(ApiKey.prefix == prefix)) is None:
            return prefix
    raise HTTPException(status_code=503, detail="Could not make a key; try again")


def create_key(db: Session, user: User, body: ApiKeyCreate) -> ApiKeyCreated:
    """A new key, with its secret in this answer only."""
    if not has_api_access(db, user):
        raise HTTPException(status_code=403, detail="API keys come with the Studio plan")
    now = datetime.utcnow()
    # Holds the owner's row, so two keys made at once can't both be the eleventh.
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    if _active_key_count(db, user.id, now) >= MAX_ACTIVE_KEYS:
        raise HTTPException(
            status_code=409, detail=f"At most {MAX_ACTIVE_KEYS} active API keys: revoke one first"
        )
    prefix = _unused_prefix(db)
    secret = keys.new_key(prefix)
    key = ApiKey(
        user_id=user.id,
        name=body.name,
        prefix=prefix,
        key_hash=keys.hash_key(secret),
        scopes=list(body.scopes),
        created_at=now,
        expires_at=now + timedelta(days=body.expires_in_days) if body.expires_in_days else None,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return ApiKeyCreated(**ApiKeyOut.model_validate(key).model_dump(), secret=secret)


def list_keys(db: Session, user: User) -> ApiKeyList:
    """The user's keys not revoked, newest first; expired ones too, until they are revoked."""
    rows = db.scalars(
        select(ApiKey)
        .where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
        .order_by(ApiKey.created_at.desc(), ApiKey.id.desc())
    ).all()
    return ApiKeyList(items=[ApiKeyOut.model_validate(row) for row in rows], max_active=MAX_ACTIVE_KEYS)


def revoke_key(db: Session, user: User, key_id: int) -> ApiKeyOut:
    """Refused from the next request on: nothing caches a key. Another user's key, or one
    already revoked, is 404."""
    key = db.scalar(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
    )
    if key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    key.revoked_at = datetime.utcnow()
    db.commit()
    db.refresh(key)
    return ApiKeyOut.model_validate(key)
