"""Per-IP rate limits trust a forwarded client IP only from the web app's own proxy, which
proves itself with INTERNAL_PROXY_TOKEN. A bare X-Forwarded-For is never believed."""

import logging

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core.client_ip import warn_if_proxy_token_missing
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db

TOKEN = "proxy-secret-for-tests"


@pytest.fixture()
def proxy_token(monkeypatch):
    """INTERNAL_PROXY_TOKEN, set for the test."""

    def configure(value: str | None) -> None:
        if value is None:
            monkeypatch.delenv("INTERNAL_PROXY_TOKEN", raising=False)
        else:
            monkeypatch.setenv("INTERNAL_PROXY_TOKEN", value)
        get_settings.cache_clear()

    configure(TOKEN)
    yield configure
    get_settings.cache_clear()


@pytest.fixture()
def sign_in(db):
    """A route allowed one request an hour per caller, keyed by IP like sign-in."""
    app = FastAPI()

    @app.post("/login", dependencies=[Depends(rate_limit_dependency("test.login", max_requests=1))])
    def login() -> dict[str, bool]:
        return {"ok": True}

    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)
    return lambda headers=None: client.post("/login", headers=headers or {}).status_code


def _proxied(ip: str, token: str = TOKEN) -> dict[str, str]:
    """What the web app's proxy sends for a caller at `ip`."""
    return {"X-Internal-Proxy-Token": token, "X-Client-IP": ip}


def test_a_spoofed_forwarded_for_without_the_token_is_ignored(proxy_token, sign_in):
    assert sign_in({"X-Forwarded-For": "203.0.113.1"}) == 200
    assert sign_in({"X-Forwarded-For": "203.0.113.2"}) == 429  # still the same caller
    assert sign_in({"X-Client-IP": "203.0.113.3"}) == 429  # and so is a bare X-Client-IP


def test_callers_the_proxy_vouches_for_get_a_budget_each(proxy_token, sign_in):
    assert [sign_in(_proxied("203.0.113.1")), sign_in(_proxied("203.0.113.1"))] == [200, 429]
    assert sign_in(_proxied("198.51.100.7")) == 200
    assert sign_in(_proxied("2001:db8::1")) == 200


def test_a_wrong_token_is_not_believed(proxy_token, sign_in):
    assert sign_in(_proxied("203.0.113.1", token="guess")) == 200
    assert sign_in(_proxied("203.0.113.2", token="guess")) == 429


def test_a_forwarded_value_that_is_not_an_ip_is_not_believed(proxy_token, sign_in):
    assert sign_in(_proxied("not-an-address")) == 200
    assert sign_in(_proxied("x" * 500)) == 429


def test_without_a_token_configured_nothing_forwarded_is_believed(proxy_token, sign_in):
    proxy_token(None)
    assert sign_in(_proxied("203.0.113.1", token="")) == 200
    assert sign_in(_proxied("203.0.113.2", token="")) == 429


def test_production_warns_at_startup_without_the_token(proxy_token, caplog):
    caplog.set_level(logging.WARNING, logger="studio.client_ip")
    settings = get_settings()

    assert warn_if_proxy_token_missing(settings.model_copy(update={"app_env": "production"})) is False
    missing = settings.model_copy(update={"app_env": "production", "internal_proxy_token": None})
    assert warn_if_proxy_token_missing(missing) is True
    assert "INTERNAL_PROXY_TOKEN is not set" in caplog.text
    assert warn_if_proxy_token_missing(missing.model_copy(update={"app_env": "development"})) is False
