"""Rate limits counted in the database, so every API process draws on one budget."""

from datetime import datetime

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.rate_limit import (
    MAX_WINDOW_SECONDS,
    check_rate_limit,
    count_request,
    delete_old_windows,
    rate_limit_dependency,
)
from app.database import get_db
from app.models import Base, RateLimitCounter

HOUR = 3600
NOW = 1_790_000_000  # 800 s into an hour window, which ends 2,800 s later


def test_requests_within_the_budget_pass(db) -> None:
    check_rate_limit(db, "test:user:1", max_requests=2, window_seconds=60)
    check_rate_limit(db, "test:user:1", max_requests=2, window_seconds=60)


def test_a_request_past_the_budget_is_refused_until_the_window_ends(db) -> None:
    check_rate_limit(db, "test:user:2", max_requests=1, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        check_rate_limit(db, "test:user:2", max_requests=1, window_seconds=60)
    assert exc.value.status_code == 429
    assert 1 <= int(exc.value.headers["Retry-After"]) <= 60


def test_keys_are_counted_apart(db) -> None:
    check_rate_limit(db, "scope:a:user:1", max_requests=1, window_seconds=60)
    check_rate_limit(db, "scope:b:user:1", max_requests=1, window_seconds=60)
    check_rate_limit(db, "scope:a:user:2", max_requests=1, window_seconds=60)


def test_a_new_window_starts_a_new_budget(db) -> None:
    assert count_request(db, "test:user:3", HOUR, now=NOW) == (1, 2800)
    assert count_request(db, "test:user:3", HOUR, now=NOW + 2799) == (2, 1)
    assert count_request(db, "test:user:3", HOUR, now=NOW + 2800) == (1, HOUR)


def test_two_api_processes_share_one_budget(tmp_path) -> None:
    """Two engines on one database, as two API processes have: neither keeps a count of its own."""
    url = f"sqlite:///{tmp_path / 'limits.db'}"
    first, second = create_engine(url), create_engine(url)
    Base.metadata.create_all(first)
    with sessionmaker(bind=first)() as one, sessionmaker(bind=second)() as other:
        check_rate_limit(one, "upload.presign:user:7", max_requests=2, window_seconds=HOUR)
        check_rate_limit(other, "upload.presign:user:7", max_requests=2, window_seconds=HOUR)
        with pytest.raises(HTTPException) as exc:
            check_rate_limit(one, "upload.presign:user:7", max_requests=2, window_seconds=HOUR)
        assert exc.value.status_code == 429
        assert other.execute(select(RateLimitCounter.count)).scalar_one() == 3
    first.dispose()
    second.dispose()


def test_windows_over_a_day_old_are_deleted(db) -> None:
    count_request(db, "old:ip:1", HOUR, now=NOW - MAX_WINDOW_SECONDS - HOUR)
    count_request(db, "recent:ip:1", HOUR, now=NOW - HOUR)
    count_request(db, "current:ip:1", HOUR, now=NOW)

    assert delete_old_windows(db, now=NOW) == 1
    assert sorted(db.execute(select(RateLimitCounter.key)).scalars()) == ["current:ip:1", "recent:ip:1"]


def test_a_window_longer_than_a_day_is_refused() -> None:
    with pytest.raises(ValueError):
        rate_limit_dependency("test", max_requests=1, window_seconds=MAX_WINDOW_SECONDS + 1)


@pytest.fixture()
def limited_app(db):
    """A route allowed two requests an hour per caller, on the test database."""
    app = FastAPI()
    limit = rate_limit_dependency("test.route", max_requests=2)

    @app.get("/limited", dependencies=[Depends(limit)])
    def limited() -> dict[str, bool]:
        return {"ok": True}

    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_the_dependency_refuses_a_caller_past_the_budget(limited_app) -> None:
    caller = {"X-Forwarded-For": "203.0.113.9"}
    assert [limited_app.get("/limited", headers=caller).status_code for _ in range(3)] == [200, 200, 429]
    assert limited_app.get("/limited", headers={"X-Forwarded-For": "198.51.100.4"}).status_code == 200


def test_an_oversized_forwarded_address_is_cut_before_it_is_stored(limited_app, db) -> None:
    assert limited_app.get("/limited", headers={"X-Forwarded-For": "1" * 5000}).status_code == 200
    assert db.execute(select(RateLimitCounter.key)).scalar_one() == "test.route:ip:" + "1" * 64


def test_no_limits_when_rate_limiting_is_off(limited_app, monkeypatch) -> None:
    from app.config import get_settings

    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    get_settings.cache_clear()
    try:
        assert {limited_app.get("/limited").status_code for _ in range(4)} == {200}
    finally:
        get_settings.cache_clear()


def test_counters_record_their_window_in_utc(db) -> None:
    count_request(db, "test:user:4", HOUR, now=NOW)
    assert db.execute(select(RateLimitCounter.window_start)).scalar_one() == datetime(2026, 9, 21, 14, 0)
