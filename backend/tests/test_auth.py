"""Phase 5 auth integration tests — sessions, password reset, scene ownership."""

from datetime import datetime

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.security import hash_password, new_session_token, session_expires_at
from app.features.scene.service import require_owned_scene
from app.main import app
from app.models.scene import Scene
from app.models.user import Session as DbSession, User


@pytest.fixture()
def client(db):
    from app.database import get_db

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _create_user(db, email: str, password: str = "secret-pass-123") -> User:
    now = datetime.utcnow()
    user = User(
        email=email,
        password_hash=hash_password(password),
        role="user",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_signup_login_and_me(client, db):
    signup = client.post(
        "/auth/signup",
        json={"email": "new@example.com", "password": "secret-pass-123", "name": "New User"},
    )
    assert signup.status_code == 200
    token = signup.json()["token"]
    assert token

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "new@example.com"

    logout = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout.status_code == 200

    me_after = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_after.status_code == 401


def test_login_rejects_invalid_credentials(client, db):
    _create_user(db, "exists@example.com")
    bad = client.post(
        "/auth/login",
        json={"email": "exists@example.com", "password": "wrong-password"},
    )
    assert bad.status_code == 401


def test_forgot_and_reset_password(client, db):
    user = _create_user(db, "reset@example.com")
    token = new_session_token()
    db.add(
        DbSession(
            token=token,
            user_id=user.id,
            expires_at=session_expires_at(),
        )
    )
    db.commit()

    forgot = client.post("/auth/forgot-password", json={"email": "reset@example.com"})
    assert forgot.status_code == 200

    from app.models.user import PasswordResetToken

    from sqlalchemy import select

    reset_row = db.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id)
        .order_by(PasswordResetToken.id.desc())
    ).scalars().first()
    assert reset_row is not None

    reset = client.post(
        "/auth/reset-password",
        json={"token": reset_row.token, "password": "new-secret-pass-456"},
    )
    assert reset.status_code == 200

    login_old = client.post(
        "/auth/login",
        json={"email": "reset@example.com", "password": "secret-pass-123"},
    )
    assert login_old.status_code == 401

    login_new = client.post(
        "/auth/login",
        json={"email": "reset@example.com", "password": "new-secret-pass-456"},
    )
    assert login_new.status_code == 200

    stale = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert stale.status_code == 401


def test_require_owned_scene_blocks_other_users(db):
    owner = _create_user(db, "owner@example.com")
    other = _create_user(db, "other@example.com")
    scene = Scene(
        name="Ring",
        model_key="models/ring.glb",
        user_id=owner.id,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)

    owned = require_owned_scene(scene, owner.id)
    assert owned.id == scene.id

    with pytest.raises(HTTPException) as exc:
        require_owned_scene(scene, other.id)
    assert exc.value.status_code == 404


def test_catalog_requires_auth(client):
    response = client.get("/catalog/metals")
    assert response.status_code == 401
