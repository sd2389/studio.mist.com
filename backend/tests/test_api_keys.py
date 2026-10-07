"""API keys (docs/adr/0006-bulk-pipeline.md, G1): made, listed and revoked from a session; used
on /v1 only, where `api_principal` checks the key, its scopes, its owner's plan and its limits.

Acceptance: a revoked key is refused at once; a key without batches:write can't create a batch;
a session can't call /v1.
"""

import hashlib
import hmac
import logging
import re
from datetime import datetime, timedelta

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db
from app.features.api_keys import keys, principal as principal_mod
from app.features.api_keys.principal import ApiPrincipal, api_principal
from app.features.billing.quota_service import get_or_create_billing, reset_allotments
from app.main import app
from app.models import ApiKey, FeatureFlag, IngestBatch, User
from app.models.user import Session as DbSession

KEY_FORMAT = re.compile(r"^mist_([a-z0-9]{8})_[0-9A-Za-z]{43}$")
DEV_PEPPER = b"development-only-api-key-pepper"
EVERY_SCOPE = list(keys.API_SCOPES)


def _set_flag(db, key: str, enabled: bool) -> None:
    db.merge(FeatureFlag(key=key, enabled=enabled, updated_at=datetime.utcnow()))
    db.commit()


def _sign_in(db, email: str, tier: str = "studio") -> tuple[User, dict[str, str]]:
    now = datetime.utcnow()
    user = User(email=email, password_hash="hash", role="user", created_at=now, updated_at=now)
    db.add(user)
    db.commit()
    reset_allotments(db, get_or_create_billing(db, user), tier)
    token = f"session-token-{user.id}"
    db.add(DbSession(token=token, user_id=user.id, expires_at=now + timedelta(days=1)))
    db.commit()
    return user, {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def client(db):
    """The API on the test database, with the customer API (bulk_pipeline) turned on."""

    def _override_db():
        yield db

    _set_flag(db, "bulk_pipeline", True)
    app.dependency_overrides[get_db] = _override_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def owner(db) -> tuple[User, dict[str, str]]:
    return _sign_in(db, "studio@example.com")


@pytest.fixture()
def other(db) -> tuple[User, dict[str, str]]:
    return _sign_in(db, "other@example.com")


def _create(client, session: dict[str, str], **fields):
    body = {"name": "Catalogue sync", "scopes": ["batches:read", "batches:write"], **fields}
    return client.post("/api-keys", headers=session, json=body)


def _new_key(client, session: dict[str, str], **fields) -> dict:
    res = _create(client, session, **fields)
    assert res.status_code == 201, res.text
    return res.json()


def _bearer(secret: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {secret}"}


def _whoami(client, secret: str):
    return client.get("/v1/whoami", headers=_bearer(secret))


def _with_settings(monkeypatch, module, **values) -> None:
    settings = get_settings().model_copy(update=values)
    monkeypatch.setattr(module, "get_settings", lambda: settings)


# The key and what is stored of it


def test_a_key_is_mist_prefix_secret_and_only_its_peppered_hash_is_stored(client, db, owner):
    created = _new_key(client, owner[1])

    secret = created["secret"]
    match = KEY_FORMAT.match(secret)
    assert match and match.group(1) == created["prefix"]
    row = db.get(ApiKey, created["id"])
    assert row.key_hash == hmac.new(DEV_PEPPER, secret.encode(), hashlib.sha256).hexdigest()
    assert row.key_hash != hashlib.sha256(secret.encode()).hexdigest()  # peppered, not a bare hash
    stored = [str(getattr(row, column.key)) for column in ApiKey.__table__.columns]
    assert not any(secret in value or secret.split("_")[2] in value for value in stored)


def test_each_key_has_its_own_prefix_and_secret(client, owner):
    first, second = _new_key(client, owner[1]), _new_key(client, owner[1])

    assert first["prefix"] != second["prefix"]
    assert first["secret"].split("_")[2] != second["secret"].split("_")[2]


def test_the_secret_is_in_the_create_answer_only(client, owner):
    res = _create(client, owner[1])
    secret = res.json()["secret"]

    assert res.headers["cache-control"] == "no-store"
    listed = client.get("/api-keys", headers=owner[1])
    assert listed.status_code == 200
    assert secret not in listed.text
    assert "secret" not in listed.json()["items"][0]
    assert listed.json()["max_active"] == 10
    whoami = _whoami(client, secret)
    assert secret not in whoami.text and "secret" not in whoami.json()["key"]


def test_the_secret_never_reaches_the_logs_or_an_error(client, owner, caplog):
    caplog.set_level(logging.DEBUG)
    secret = _new_key(client, owner[1])["secret"]
    _whoami(client, secret)
    wrong = secret[:-4] + ("AAAA" if not secret.endswith("AAAA") else "BBBB")
    refused = _whoami(client, wrong)

    assert refused.status_code == 401
    assert wrong not in refused.text and secret not in refused.text
    assert secret not in caplog.text and wrong not in caplog.text


def test_a_new_pepper_refuses_every_key(client, owner, monkeypatch):
    secret = _new_key(client, owner[1])["secret"]

    _with_settings(monkeypatch, keys, api_key_pepper="another-pepper-of-at-least-32-characters")
    assert _whoami(client, secret).status_code == 401


def test_production_without_a_pepper_makes_no_key(client, db, owner, monkeypatch):
    _with_settings(monkeypatch, keys, app_env="production", api_key_pepper=None)

    assert _create(client, owner[1]).status_code == 503
    assert db.scalars(select(ApiKey)).all() == []


# Acceptance


def test_a_revoked_key_is_refused_at_once(client, owner):
    created = _new_key(client, owner[1])
    assert _whoami(client, created["secret"]).status_code == 200

    revoked = client.delete(f"/api-keys/{created['id']}", headers=owner[1])

    assert revoked.status_code == 200 and revoked.json()["revoked_at"]
    refused = _whoami(client, created["secret"])
    assert (refused.status_code, refused.json()["detail"]) == (401, "This API key was revoked")
    assert client.get("/api-keys", headers=owner[1]).json()["items"] == []


@pytest.fixture()
def batch_api(db):
    """/v1/batches behind the scopes G2's routes will name: making one needs batches:write. The
    route records who it would make a batch for; G1 mounts no batch route of its own."""
    made: list[int] = []
    probe = FastAPI()

    @probe.post("/v1/batches", status_code=201)
    def create_batch(caller: ApiPrincipal = Depends(api_principal("batches:write"))) -> dict:
        made.append(caller.user.id)
        return {"user_id": caller.user.id}

    @probe.get("/v1/batches")
    def list_batches(caller: ApiPrincipal = Depends(api_principal("batches:read"))) -> dict:
        return {"user_id": caller.user.id}

    probe.dependency_overrides[get_db] = lambda: db
    return TestClient(probe), made


def test_a_key_without_batches_write_cannot_create_a_batch(client, db, owner, batch_api):
    api, made = batch_api
    reader = _new_key(client, owner[1], scopes=["batches:read", "render_jobs:write"])["secret"]
    writer = _new_key(client, owner[1], scopes=["batches:write"])["secret"]

    refused = api.post("/v1/batches", headers=_bearer(reader))
    assert (refused.status_code, refused.json()["detail"]) == (403, "This API key lacks the batches:write scope")
    assert made == []
    # Nor through the studio's own batch route, which takes sessions only.
    studio_route = client.post("/ingest/batches", headers=_bearer(reader), json={})
    assert studio_route.status_code == 401
    assert db.scalars(select(IngestBatch)).all() == []

    created = api.post("/v1/batches", headers=_bearer(writer))
    assert created.status_code == 201
    assert made == [owner[0].id]  # a key acts as its owner
    assert api.get("/v1/batches", headers=_bearer(writer)).status_code == 403  # write grants no read


def test_a_session_cannot_call_v1(client, owner):
    token = owner[1]["Authorization"].removeprefix("Bearer ")

    assert _whoami(client, token).status_code == 401
    by_cookie = client.get("/v1/whoami", headers={"Cookie": f"studio_session={token}"})
    assert by_cookie.status_code == 401
    assert by_cookie.headers["www-authenticate"] == "Bearer"
    assert client.get("/v1/whoami").status_code == 401


def test_a_cookie_beside_a_key_adds_nothing(client, owner):
    reader = _new_key(client, owner[1], scopes=["batches:read"])

    res = client.get(
        "/v1/whoami",
        headers={**_bearer(reader["secret"]), "Cookie": f"studio_session={owner[1]['Authorization'][7:]}"},
    )
    assert res.status_code == 200
    assert res.json()["key"]["scopes"] == ["batches:read"]


# Keys and sessions stay apart


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", "/auth/me"), ("get", "/api-keys"), ("post", "/api-keys"), ("get", "/ingest/batches"), ("get", "/scenes")],
)
def test_a_key_is_refused_on_session_routes(client, owner, method, path):
    secret = _new_key(client, owner[1], scopes=EVERY_SCOPE)["secret"]

    res = client.request(method, path, headers=_bearer(secret), json={"name": "x", "scopes": ["batches:read"]})
    assert (res.status_code, res.json()["detail"]) == (401, "API keys work only on /v1")


def test_a_session_token_is_never_taken_for_a_key(client, db, owner):
    """Only a key's exact form is refused as one: a session token (43 URL-safe characters) that
    happens to start like a key still signs in, and a broken key is no session either."""
    token = "mist_" + "x" * 38
    db.add(DbSession(token=token, user_id=owner[0].id, expires_at=datetime.utcnow() + timedelta(days=1)))
    db.commit()

    assert client.get("/auth/me", headers=_bearer(token)).status_code == 200
    broken = client.get("/auth/me", headers=_bearer("mist_abcd1234_tooshort"))
    assert (broken.status_code, broken.json()["detail"]) == (401, "Invalid or expired session")
    assert _whoami(client, token).status_code == 401


def test_a_key_cannot_revoke_keys(client, owner):
    created = _new_key(client, owner[1], scopes=EVERY_SCOPE)

    assert client.delete(f"/api-keys/{created['id']}", headers=_bearer(created["secret"])).status_code == 401
    assert _whoami(client, created["secret"]).status_code == 200


def test_a_key_is_no_session_on_public_routes(client, owner):
    secret = _new_key(client, owner[1])["secret"]

    assert client.get("/features", headers=_bearer(secret)).status_code == 200


@pytest.mark.parametrize("origin", [None, "https://attacker.example"])
def test_a_cookie_alone_neither_makes_nor_revokes_a_key(client, db, owner, origin):
    """CSRF: a request another site makes the browser send carries the session cookie but no
    Authorization header, which the web app's proxy alone adds. The API reads no cookie."""
    created = _new_key(client, owner[1])
    token = owner[1]["Authorization"].removeprefix("Bearer ")
    ambient = {"Cookie": f"studio_session={token}", **({"Origin": origin} if origin else {})}

    made = client.post("/api-keys", headers=ambient, json={"name": "Forged", "scopes": ["batches:write"]})
    revoked = client.delete(f"/api-keys/{created['id']}", headers=ambient)

    assert (made.status_code, revoked.status_code) == (401, 401)
    assert [key.name for key in db.scalars(select(ApiKey))] == ["Catalogue sync"]
    assert db.get(ApiKey, created["id"]).revoked_at is None


def test_another_users_key_is_not_found(client, owner, other):
    theirs = _new_key(client, other[1])

    assert client.delete(f"/api-keys/{theirs['id']}", headers=owner[1]).status_code == 404
    assert client.delete("/api-keys/999999", headers=owner[1]).status_code == 404
    assert [key["id"] for key in client.get("/api-keys", headers=owner[1]).json()["items"]] == []
    assert _whoami(client, theirs["secret"]).status_code == 200


def test_a_key_already_revoked_is_not_found(client, owner):
    created = _new_key(client, owner[1])

    assert client.delete(f"/api-keys/{created['id']}", headers=owner[1]).status_code == 200
    assert client.delete(f"/api-keys/{created['id']}", headers=owner[1]).status_code == 404


# Scopes


@pytest.mark.parametrize(
    ("scopes", "needed", "status"),
    [
        (["batches:read"], "batches:read", 200),
        (["batches:read"], "scenes:read", 403),
        (["render_jobs:write"], "render_jobs:read", 403),
        (["webhooks:write", "scenes:read"], "scenes:read", 200),
    ],
)
def test_api_principal_wants_the_scope_named(client, db, owner, scopes, needed, status):
    probe = FastAPI()

    @probe.get("/v1/probe")
    def scoped(_caller: ApiPrincipal = Depends(api_principal(needed))) -> dict:
        return {}

    probe.dependency_overrides[get_db] = lambda: db
    secret = _new_key(client, owner[1], scopes=scopes)["secret"]
    assert TestClient(probe).get("/v1/probe", headers=_bearer(secret)).status_code == status


def test_an_unknown_scope_is_a_programming_error():
    with pytest.raises(ValueError):
        api_principal("everything")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "body",
    [
        {"name": "x", "scopes": ["admin"]},
        {"name": "x", "scopes": []},
        {"name": "   ", "scopes": ["batches:read"]},
        {"name": "x" * 101, "scopes": ["batches:read"]},
        {"name": "x", "scopes": ["batches:read"], "expires_in_days": 0},
        {"name": "x", "scopes": ["batches:read"], "expires_in_days": 366},
        {"name": "x", "scopes": ["batches:read"], "user_id": 2},
    ],
)
def test_a_key_needs_a_name_and_known_scopes(client, db, owner, body):
    assert client.post("/api-keys", headers=owner[1], json=body).status_code == 422
    assert db.scalars(select(ApiKey)).all() == []


def test_scopes_are_kept_once_each_in_their_order(client, owner):
    created = _new_key(client, owner[1], scopes=["scenes:read", "batches:read", "scenes:read"])

    assert created["scopes"] == ["batches:read", "scenes:read"]


def test_whoami_names_the_key_and_its_owner(client, owner):
    created = _new_key(client, owner[1], name="  ERP  ")

    body = _whoami(client, created["secret"]).json()
    assert body["user_id"] == owner[0].id
    assert body["plan_tier"] == "studio"
    assert {k: body["key"][k] for k in ("id", "name", "prefix", "scopes")} == {
        "id": created["id"], "name": "ERP", "prefix": created["prefix"], "scopes": ["batches:read", "batches:write"],
    }


# Expiry, limits and use


def test_a_key_expires_when_it_was_made_to(client, db, owner):
    created = _new_key(client, owner[1], expires_in_days=30)
    row = db.get(ApiKey, created["id"])
    assert timedelta(days=29, hours=23) < row.expires_at - datetime.utcnow() <= timedelta(days=30)
    assert created["expires_at"].endswith("Z")
    assert _whoami(client, created["secret"]).status_code == 200

    row.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()

    refused = _whoami(client, created["secret"])
    assert (refused.status_code, refused.json()["detail"]) == (401, "This API key has expired")
    assert [key["id"] for key in client.get("/api-keys", headers=owner[1]).json()["items"]] == [created["id"]]


def test_a_key_without_expiry_never_expires(client, db, owner):
    created = _new_key(client, owner[1])

    assert created["expires_at"] is None and db.get(ApiKey, created["id"]).expires_at is None


def test_at_most_ten_active_keys(client, db, owner):
    made = [_new_key(client, owner[1]) for _ in range(10)]

    eleventh = _create(client, owner[1])
    assert eleventh.status_code == 409
    assert "secret" not in eleventh.text

    client.delete(f"/api-keys/{made[0]['id']}", headers=owner[1])
    assert _create(client, owner[1]).status_code == 201
    db.get(ApiKey, made[1]["id"]).expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    assert _create(client, owner[1]).status_code == 201  # an expired key isn't active
    assert _create(client, owner[1]).status_code == 409


def test_the_limit_is_per_user(client, owner, other):
    for _ in range(10):
        _new_key(client, owner[1])

    assert _create(client, other[1]).status_code == 201


def test_each_key_has_its_own_reads_a_minute(client, owner, monkeypatch):
    first, second = _new_key(client, owner[1])["secret"], _new_key(client, owner[1])["secret"]
    _with_settings(monkeypatch, principal_mod, rate_limit_api_reads_per_minute=2)

    assert [_whoami(client, first).status_code for _ in range(3)] == [200, 200, 429]
    limited = _whoami(client, first)
    assert 0 < int(limited.headers["retry-after"]) <= 60
    assert _whoami(client, second).status_code == 200


def test_writes_have_their_own_budget(client, owner, batch_api, monkeypatch):
    api, made = batch_api
    secret = _new_key(client, owner[1], scopes=["batches:read", "batches:write"])["secret"]
    _with_settings(monkeypatch, principal_mod, rate_limit_api_writes_per_minute=1, rate_limit_api_reads_per_minute=5)

    assert [api.post("/v1/batches", headers=_bearer(secret)).status_code for _ in range(2)] == [201, 429]
    assert len(made) == 1
    assert api.get("/v1/batches", headers=_bearer(secret)).status_code == 200


def test_last_used_is_written_at_most_once_a_minute(client, db, owner):
    created = _new_key(client, owner[1])
    assert created["last_used_at"] is None
    row = db.get(ApiKey, created["id"])

    _whoami(client, created["secret"])
    db.refresh(row)
    first_use = row.last_used_at
    assert first_use is not None

    recent = datetime.utcnow() - timedelta(seconds=30)
    row.last_used_at = recent
    db.commit()
    _whoami(client, created["secret"])
    db.refresh(row)
    assert row.last_used_at == recent

    stale = datetime.utcnow() - timedelta(minutes=2)
    row.last_used_at = stale
    db.commit()
    _whoami(client, created["secret"])
    db.refresh(row)
    assert row.last_used_at > stale + timedelta(minutes=1)


# Owner, plan and flag


def test_keys_come_with_the_studio_plan(client, db):
    _, grow = _sign_in(db, "grow@example.com", tier="grow")
    _, free = _sign_in(db, "free@example.com", tier="free")

    for session in (grow, free):
        res = _create(client, session)
        assert (res.status_code, res.json()["detail"]) == (403, "API keys come with the Studio plan")
    assert client.get("/api-keys", headers=grow).status_code == 200


def test_a_key_is_bound_by_its_owners_plan(client, db, owner):
    secret = _new_key(client, owner[1])["secret"]

    reset_allotments(db, get_or_create_billing(db, owner[0]), "grow")

    refused = _whoami(client, secret)
    assert (refused.status_code, refused.json()["detail"]) == (403, "The API comes with the Studio plan")


def test_a_disabled_account_disables_its_keys(client, db, owner):
    secret = _new_key(client, owner[1])["secret"]

    db.get(User, owner[0].id).is_active = False
    db.commit()

    assert _whoami(client, secret).status_code == 403


def test_deleting_an_account_deletes_its_keys(client, db, owner, other):
    _new_key(client, owner[1])
    kept = _new_key(client, other[1])

    db.delete(db.get(User, owner[0].id))
    db.commit()

    assert [key.id for key in db.scalars(select(ApiKey))] == [kept["id"]]


def test_with_the_pipeline_off_v1_is_hidden_and_no_key_is_made(client, db, owner):
    created = _new_key(client, owner[1])
    _set_flag(db, "bulk_pipeline", False)

    assert _whoami(client, created["secret"]).status_code == 404
    assert _create(client, owner[1]).status_code == 404
    assert len(client.get("/api-keys", headers=owner[1]).json()["items"]) == 1
    assert client.delete(f"/api-keys/{created['id']}", headers=owner[1]).status_code == 200


def test_making_and_revoking_keys_is_rate_limited(client, owner, monkeypatch):
    from app.routers import api_keys as api_keys_router
    from app.core.rate_limit import rate_limit_dependency

    limited = rate_limit_dependency("api-keys-test", max_requests=1, require_auth=True)
    app.dependency_overrides[api_keys_router._key_change] = limited

    assert [_create(client, owner[1]).status_code for _ in range(2)] == [201, 429]
