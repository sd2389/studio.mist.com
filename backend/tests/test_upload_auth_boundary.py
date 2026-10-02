"""Unauthenticated upload write endpoints must fail closed."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User


@pytest.fixture()
def client(db):
    from app.database import get_db

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def user(db) -> User:
    now = datetime.utcnow()
    row = User(
        email="uploader@example.com",
        password_hash="hash",
        role="user",
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_presign_requires_auth(client, db, monkeypatch):
    called = {"n": 0}

    def boom(*_args, **_kwargs):
        called["n"] += 1
        raise AssertionError("presign service must not run without auth")

    monkeypatch.setattr("app.features.upload.service.presign_upload_url", boom)

    res = client.post(
        "/upload/presign",
        json={"filename": "ring.glb", "content_type": "model/gltf-binary"},
    )
    assert res.status_code == 401
    assert called["n"] == 0


def test_register_requires_auth(client, db, monkeypatch, user):
    called = {"n": 0}

    def boom(*_args, **_kwargs):
        called["n"] += 1
        raise AssertionError("register service must not run without auth")

    monkeypatch.setattr("app.features.upload.service.register_after_presign", boom)

    res = client.post(
        "/upload/register",
        json={
            "key": f"customers/{user.id}/models/ring.glb",
            "name": "Ring",
            "sku": "SKU-1",
        },
    )
    assert res.status_code == 401
    assert called["n"] == 0


def test_direct_upload_requires_auth(client, db, monkeypatch):
    called = {"n": 0}

    def boom(*_args, **_kwargs):
        called["n"] += 1
        raise AssertionError("direct upload service must not run without auth")

    monkeypatch.setattr("app.features.upload.service.save_direct_multipart", boom)

    res = client.post(
        "/upload",
        files={"file": ("ring.glb", b"glb-bytes", "model/gltf-binary")},
        data={"name": "Ring", "sku": "SKU-1"},
    )
    assert res.status_code == 401
    assert called["n"] == 0
