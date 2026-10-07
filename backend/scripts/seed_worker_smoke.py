"""CLI for `npm run worker:smoke` (scripts/render-worker/smoke.mjs): a database in which a Free
user can create render jobs for a worker to render, and a Grow user Campaign Packs.

Creates the tables (the smoke runs on a throwaway SQLite file; Alembic's migrations are written
for Postgres), turns the server_exports flag on, seeds the smoke user with render credits and a
scene of the demo ring on local storage (as scripts.seed_smoke_job does), and signs the user in;
then the same for a second user on Grow, whose plan makes packs. The last line printed is JSON:
{"token", "user_id", "scene_id", "grow": {"token", "user_id", "scene_id"}}.

Usage, from backend/, with DATABASE_URL, STORAGE_BACKEND=local and UPLOAD_DIR set:
    python -m scripts.seed_worker_smoke
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta

from app.core.security import hash_password
from app.database import SessionLocal, engine
from app.features.billing.quota_service import get_or_create_billing, reset_allotments
from app.models import Base
from app.models.feature_flag import FeatureFlag
from app.models.user import Session as DbSession
from app.models.user import User
from scripts.seed_smoke_job import ensure_render_credits, get_or_create_smoke_scene, get_or_create_smoke_user

RENDER_CREDITS = 10
# The smoke's pack costs 14: four stills, two spins and two short turntables.
GROW_RENDER_CREDITS = 50
GROW_EMAIL = "smoke-grow@devjewels.test"
SESSION_HOURS = 2


def _grow_user(db) -> User:
    """A second smoke user, on Grow: Campaign Packs are part of Grow and Studio."""
    now = datetime.utcnow()
    user = User(
        email=GROW_EMAIL,
        password_hash=hash_password(secrets.token_urlsafe(16)),
        name="Smoke Grower",
        is_active=True,
        role="user",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    reset_allotments(db, get_or_create_billing(db, user), "grow")
    ensure_render_credits(db, user, GROW_RENDER_CREDITS)
    return user


def _signed_in(db, user: User, scene_id: int, now: datetime) -> dict:
    token = secrets.token_urlsafe(32)
    db.add(DbSession(token=token, user_id=user.id, expires_at=now + timedelta(hours=SESSION_HOURS), created_at=now))
    db.commit()
    return {"token": token, "user_id": user.id, "scene_id": scene_id}


def main() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        now = datetime.utcnow()
        db.merge(FeatureFlag(key="server_exports", enabled=True, updated_at=now))
        db.commit()
        user = get_or_create_smoke_user(db)
        ensure_render_credits(db, user, RENDER_CREDITS)
        scene = get_or_create_smoke_scene(db, user, bogus=False)
        grower = _grow_user(db)
        grow_scene = get_or_create_smoke_scene(db, grower, bogus=False)
        seeded = _signed_in(db, user, scene.id, now)
        print(json.dumps({**seeded, "grow": _signed_in(db, grower, grow_scene.id, now)}))


if __name__ == "__main__":
    main()
