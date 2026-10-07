"""`api_principal(scope)`: who a /v1 request acts as, from its API key and nothing else.

Only `Authorization: Bearer mist_…` is read: a session token, a cookie or any other header never
authenticates here, as an API key never does on the session routes (core/deps.py). Each request
finds its key by prefix, compares the hash in constant time and reads its revocation, expiry and
owner afresh, so a revoked key is refused from the next request. The owner must be active and on
a plan with API access; the key is limited per minute, reads and writes apart.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Annotated, Callable

from fastapi import Depends, Header, HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import extract_bearer
from app.core.rate_limit import check_rate_limit
from app.database import get_db
from app.features.api_keys import keys
from app.features.api_keys.service import has_api_access
from app.models.api_key import ApiKey
from app.models.user import User

LAST_USED_RESOLUTION = timedelta(minutes=1)
_RATE_WINDOW_SECONDS = 60
_CHALLENGE = {"WWW-Authenticate": "Bearer"}


@dataclass(frozen=True)
class ApiPrincipal:
    """A /v1 request's key and the owner it acts as, bound by the owner's plan."""

    key: ApiKey
    user: User


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers=_CHALLENGE)


def authenticate_key(db: Session, authorization: str | None, now: datetime) -> ApiPrincipal:
    """The key and owner of a bearer API key, or 401/403. Messages never repeat the key."""
    token = extract_bearer(authorization)
    prefix = keys.prefix_of(token) if token else None
    if token is None or prefix is None:
        raise _unauthorized("An API key is required: Authorization: Bearer mist_…")
    row = db.execute(
        select(ApiKey, User).join(User, User.id == ApiKey.user_id).where(ApiKey.prefix == prefix)
    ).first()
    if row is None or not keys.hash_matches(token, row[0].key_hash):
        raise _unauthorized("Invalid API key")
    key, user = row
    if key.revoked_at is not None:
        raise _unauthorized("This API key was revoked")
    if key.expires_at is not None and key.expires_at <= now:
        raise _unauthorized("This API key has expired")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not has_api_access(db, user):
        raise HTTPException(status_code=403, detail="The API comes with the Studio plan")
    return ApiPrincipal(key=key, user=user)


def limit_key(db: Session, key: ApiKey, *, writes: bool) -> None:
    """Count the request against the key's reads or writes this minute; past them, 429."""
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return
    if writes:
        bucket, budget = "writes", settings.rate_limit_api_writes_per_minute
    else:
        bucket, budget = "reads", settings.rate_limit_api_reads_per_minute
    check_rate_limit(db, f"api-{bucket}:key:{key.id}", max_requests=budget, window_seconds=_RATE_WINDOW_SECONDS)


def require_scope(key: ApiKey, scope: keys.ApiScope | None) -> None:
    if scope is not None and scope not in key.scopes:
        raise HTTPException(status_code=403, detail=f"This API key lacks the {scope} scope")


def mark_used(db: Session, key: ApiKey, now: datetime) -> None:
    """Record the use at most once a minute: one conditional UPDATE, skipped while it is fresh."""
    if key.last_used_at is not None and now - key.last_used_at < LAST_USED_RESOLUTION:
        return
    db.execute(
        update(ApiKey)
        .where(
            ApiKey.id == key.id,
            or_(ApiKey.last_used_at.is_(None), ApiKey.last_used_at <= now - LAST_USED_RESOLUTION),
        )
        .values(last_used_at=now)
    )
    db.commit()


def api_principal(scope: keys.ApiScope | None = None) -> Callable[..., ApiPrincipal]:
    """A dependency for /v1 routes: the caller's key and owner, with `scope` (any key without
    one). A write scope counts against the key's writes, everything else against its reads."""
    if scope is not None and scope not in keys.API_SCOPES:
        raise ValueError(f"Unknown API scope: {scope}")
    writes = scope is not None and scope.endswith(":write")

    def _principal(
        db: Annotated[Session, Depends(get_db)],
        authorization: Annotated[str | None, Header()] = None,
    ) -> ApiPrincipal:
        now = datetime.utcnow()
        principal = authenticate_key(db, authorization, now)
        limit_key(db, principal.key, writes=writes)
        require_scope(principal.key, scope)
        mark_used(db, principal.key, now)
        return principal

    return _principal
