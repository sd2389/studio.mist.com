"""CLI for `npm run worker:smoke` (scripts/render-worker/smoke.mjs): a database in which a Free
user can create render jobs for a worker to render.

Creates the tables (the smoke runs on a throwaway SQLite file; Alembic's migrations are written
for Postgres), turns the server_exports flag on, seeds the smoke user with render credits and a
scene of the demo ring on local storage (as scripts.seed_smoke_job does), and signs the user in.
The last line printed is JSON: {"token", "user_id", "scene_id"}.

Usage, from backend/, with DATABASE_URL, STORAGE_BACKEND=local and UPLOAD_DIR set:
    python -m scripts.seed_worker_smoke
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta

from app.database import SessionLocal, engine
from app.models import Base
from app.models.feature_flag import FeatureFlag
from app.models.user import Session as DbSession
from scripts.seed_smoke_job import _ensure_render_credits, _get_or_create_smoke_scene, _get_or_create_smoke_user

RENDER_CREDITS = 10
SESSION_HOURS = 2


def main() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        now = datetime.utcnow()
        db.merge(FeatureFlag(key="server_exports", enabled=True, updated_at=now))
        db.commit()
        user = _get_or_create_smoke_user(db)
        _ensure_render_credits(db, user, RENDER_CREDITS)
        scene = _get_or_create_smoke_scene(db, user, bogus=False)
        token = secrets.token_urlsafe(32)
        db.add(DbSession(token=token, user_id=user.id, expires_at=now + timedelta(hours=SESSION_HOURS), created_at=now))
        db.commit()
        print(json.dumps({"token": token, "user_id": user.id, "scene_id": scene.id}))


if __name__ == "__main__":
    main()
