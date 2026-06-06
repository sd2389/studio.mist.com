"""In-memory per-user rate limiting for abuse-sensitive endpoints."""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock
from typing import Annotated, Callable

from fastapi import Depends, HTTPException, Request

from app.config import get_settings
from app.core.deps import get_current_user, get_optional_user
from app.models.user import User


@dataclass
class _Bucket:
    timestamps: list[float] = field(default_factory=list)


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = defaultdict(_Bucket)
        self._lock = Lock()

    def check(self, key: str, *, max_requests: int, window_seconds: int) -> None:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._buckets[key]
            bucket.timestamps = [stamp for stamp in bucket.timestamps if stamp > cutoff]
            if len(bucket.timestamps) >= max_requests:
                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded. Try again later.",
                    headers={"Retry-After": str(window_seconds)},
                )
            bucket.timestamps.append(now)

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


_limiter = InMemoryRateLimiter()


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
    return f"{scope}:ip:{_client_ip(request)}"


def rate_limit_dependency(
    scope: str,
    *,
    max_requests: int,
    window_seconds: int = 3600,
    require_auth: bool = False,
) -> Callable[..., None]:
    def _check(request: Request, user: User | None) -> None:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return
        key = _rate_limit_key(request, user, scope)
        _limiter.check(key, max_requests=max_requests, window_seconds=window_seconds)

    if require_auth:

        def _enforce_auth(
            request: Request,
            user: Annotated[User, Depends(get_current_user)],
        ) -> None:
            _check(request, user)

        return _enforce_auth

    def _enforce_public(
        request: Request,
        user: Annotated[User | None, Depends(get_optional_user)],
    ) -> None:
        _check(request, user)

    return _enforce_public


def get_rate_limiter() -> InMemoryRateLimiter:
    return _limiter
