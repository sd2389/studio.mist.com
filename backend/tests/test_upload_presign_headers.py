"""A presigned upload says which headers to send: the URL signs them, and the storage refuses a
PUT that sends anything else."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.cache_policy import cache_control_for_key
from app.core.deps import get_current_user
from app.database import get_db
from app.main import app
from app.models.user import User


@pytest.fixture()
def client(db, monkeypatch):
    now = datetime.utcnow()
    user = User(email="presigner@example.com", password_hash="hash", role="user", created_at=now, updated_at=now)
    db.add(user)
    db.commit()

    def _override_db():
        yield db

    monkeypatch.setattr(
        "app.features.upload.service.storage.presign_put",
        lambda key, content_type, expires_in=900: f"https://storage.example/{key}?signed",
    )
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [("ring.glb", "model/gltf-binary"), ("thumbnail.webp", "image/webp")],
)
def test_presign_returns_the_headers_the_upload_must_send(client, filename, content_type):
    res = client.post("/upload/presign", json={"filename": filename, "content_type": content_type})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["headers"] == {"Content-Type": content_type, "Cache-Control": cache_control_for_key(body["key"])}
