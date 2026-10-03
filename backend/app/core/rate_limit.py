"""Per-user (or per-IP) rate limits for abuse-sensitive endpoints.

Requests are counted in the database, one row per key and fixed window, so every API process
draws on the same budget. Postgres in production; SQLite (tests, local) runs the same upsert.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Callable

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user, get_optional_user
from app.database import get_db
from app.models.rate_limit import RateLimitCounter
from app.models.user import User

# The longest window a limit may use. Counters older than this are deleted, once a day.
MAX_WINDOW_SECONDS = 24 * 3600
# An IPv6 address is at most 45 characters; anything longer in a header is cut, not stored.
_MAX_IDENTITY_LENGTH = 64

_next_cleanup = 0.0


def _utc(epoch_seconds: int) -> datetime:
    """A naive UTC datetime, as every timestamp in the schema is."""
    return datetime.fromtimestamp(epoch_seconds, timezone.utc).replace(tzinfo=None)


def count_request(db: Session, key: str, window_seconds: int, now: float | None = None) -> tuple[int, int]:
    """Count one request against `key` in the current window, committed at once so every
    process sees it. Returns (requests in the window so far, seconds until it ends)."""
    clock = int(time.time() if now is None else now)
    window_start = clock - clock % window_seconds
    insert = postgresql.insert if db.get_bind().dialect.name == "postgresql" else sqlite.insert
    upsert = (
        insert(RateLimitCounter)
        .values(key=key, window_start=_utc(window_start), count=1)
        .on_conflict_do_update(
            index_elements=[RateLimitCounter.key, RateLimitCounter.window_start],
            set_={"count": RateLimitCounter.count + 1},
        )
        .returning(RateLimitCounter.count)
    )
    count = db.execute(upsert).scalar_one()
    db.commit()
    return count, window_start + window_seconds - clock


def delete_old_windows(db: Session, now: float | None = None) -> int:
    """Delete counters whose window started more than MAX_WINDOW_SECONDS ago; they have all
    ended. Returns how many were deleted."""
    cutoff = _utc(int(time.time() if now is None else now)) - timedelta(seconds=MAX_WINDOW_SECONDS)
    deleted = db.execute(delete(RateLimitCounter).where(RateLimitCounter.window_start < cutoff))
    db.commit()
    return deleted.rowcount


def check_rate_limit(db: Session, key: str, *, max_requests: int, window_seconds: int) -> None:
    """Count the request; past `max_requests` in the window it is refused (429). Each
    process also clears ended windows once a day."""
    global _next_cleanup
    count, seconds_left = count_request(db, key, window_seconds)
    if time.time() >= _next_cleanup:
        _next_cleanup = time.time() + MAX_WINDOW_SECONDS
        delete_old_windows(db)
    if count > max_requests:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again later.",
            headers={"Retry-After": str(seconds_left)},
        )


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _rate_limit_key(request: Request, user: User | None, scope: str) -> str:
    if user is not None:
        return f"{scope}:user:{user.id}"
    return f"{scope}:ip:{_client_ip(request)[:_MAX_IDENTITY_LENGTH]}"


def rate_limit_dependency(
    scope: str,
    *,
    max_requests: int,
    window_seconds: int = 3600,
    require_auth: bool = False,
) -> Callable[..., None]:
    if not 0 < window_seconds <= MAX_WINDOW_SECONDS:
        raise ValueError(f"window_seconds must be between 1 and {MAX_WINDOW_SECONDS}")

    def _check(request: Request, user: User | None, db: Session) -> None:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return
        key = _rate_limit_key(request, user, scope)
        check_rate_limit(db, key, max_requests=max_requests, window_seconds=window_seconds)

    if require_auth:

        def _enforce_auth(
            request: Request,
            user: Annotated[User, Depends(get_current_user)],
            db: Annotated[Session, Depends(get_db)],
        ) -> None:
            _check(request, user, db)

        return _enforce_auth

    def _enforce_public(
        request: Request,
        user: Annotated[User | None, Depends(get_optional_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> None:
        _check(request, user, db)

    return _enforce_public
