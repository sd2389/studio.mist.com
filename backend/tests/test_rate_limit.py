import pytest
from fastapi import HTTPException

from app.core.rate_limit import InMemoryRateLimiter


def test_rate_limiter_allows_requests_within_window() -> None:
    limiter = InMemoryRateLimiter()
    limiter.check("test:user:1", max_requests=2, window_seconds=60)
    limiter.check("test:user:1", max_requests=2, window_seconds=60)


def test_rate_limiter_blocks_excess_requests() -> None:
    limiter = InMemoryRateLimiter()
    limiter.check("test:user:2", max_requests=1, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        limiter.check("test:user:2", max_requests=1, window_seconds=60)
    assert exc.value.status_code == 429


def test_rate_limiter_scopes_keys_independently() -> None:
    limiter = InMemoryRateLimiter()
    limiter.check("scope:a:user:1", max_requests=1, window_seconds=60)
    limiter.check("scope:b:user:1", max_requests=1, window_seconds=60)
