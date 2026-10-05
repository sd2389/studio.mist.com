"""CLI: create (or reuse) a smoke-test user and scene, then queue a render job for them.

Idempotent on the user and the scene: re-running reuses both. The job is always new, so you can
run the script several times to queue more. It is queued the way the studio queues one
(POST /render-jobs): validated, priced and its credits held, for a worker to claim.

Usage (inside the backend container):
    python -m scripts.seed_smoke_job
    python -m scripts.seed_smoke_job --bogus   # a scene whose model file is missing: the failure path

Expected env vars in the container:
    DATABASE_URL  (standard — already set by docker-compose)
    RENDER_WORKER_TOKEN  (the shared secret; echoed back so you know it's set)
"""

from __future__ import annotations

import argparse
from datetime import datetime

from sqlalchemy import select

from app.core import storage
from app.core.security import hash_password
from app.database import SessionLocal
from app.features.billing.quota_service import get_or_create_billing
from app.features.demo_embed.service import demo_model_config, fixture_glb_path
from app.features.render_jobs.service import create_job
from app.models.billing import UserBilling
from app.models.render_job import RenderJob
from app.models.scene import Scene
from app.models.user import User
from app.schemas.render_job import RenderJobCreate

SMOKE_EMAIL = "smoke@devjewels.test"
SMOKE_PASSWORD = "smoke-password-not-for-prod"
SMOKE_NAME = "Smoke Tester"
RENDER_CREDITS_GRANT = 5
# The worker renders this still: the studio's default pose, 1024 px square.
SMOKE_SPEC = {"camera": {"pose": "pose-default"}, "width": 1024, "height": 1024}


def get_or_create_smoke_user(db) -> User:
    user = db.execute(
        select(User).where(User.email == SMOKE_EMAIL)
    ).scalars().first()

    if user is not None:
        print(f"[seed] reusing existing user id={user.id} email={user.email}")
        return user

    now = datetime.utcnow()
    user = User(
        email=SMOKE_EMAIL,
        password_hash=hash_password(SMOKE_PASSWORD),
        name=SMOKE_NAME,
        is_active=True,
        role="user",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"[seed] created user id={user.id} email={user.email}")
    return user


def ensure_render_credits(db, user: User, amount: int) -> int:
    """Ensure billing row exists and set render_credits_balance to `amount`.

    Returns the balance after the operation.
    """
    billing: UserBilling = get_or_create_billing(db, user)
    billing.render_credits_balance = amount
    billing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(billing)
    return billing.render_credits_balance


def get_or_create_smoke_scene(db, user: User, bogus: bool) -> Scene:
    """The smoke user's scene of the demo ring: its model is stored under the user's prefix,
    except with --bogus, whose scene names a model file that was never stored."""
    model_key = f"customers/{user.id}/models/{'missing' if bogus else 'smoke'}-ring.glb"
    if not bogus:
        storage.write_bytes(model_key, fixture_glb_path().read_bytes(), content_type="model/gltf-binary")
    scene = db.execute(
        select(Scene).where(Scene.user_id == user.id, Scene.model_key == model_key)
    ).scalars().first()
    if scene is not None:
        return scene
    now = datetime.utcnow()
    config = demo_model_config()
    scene = Scene(
        user_id=user.id,
        model_key=model_key,
        name="Smoke ring (bogus model)" if bogus else "Smoke ring",
        material="gold-14k-yellow",
        lighting="studio",
        model_config=config,
        slot_selections={"Metal 1": "gold-14k-yellow", "Gem 1": "diamond"},
        scene_settings=config["sceneSettings"],
        created_at=now,
        updated_at=now,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def _enqueue_job(db, user: User, scene: Scene) -> RenderJob:
    job, _ = create_job(db, user, RenderJobCreate(kind="still", scene_id=scene.id, spec=SMOKE_SPEC))
    return job


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed a smoke RenderJob for end-to-end testing."
    )
    parser.add_argument(
        "--bogus",
        action="store_true",
        help="Queue it for a scene whose model file is missing (failure path smoke test)",
    )
    args = parser.parse_args()

    # Echo the configured token so the operator can sanity-check
    try:
        from app.config import get_settings
        token = get_settings().render_worker_token or "(NOT SET — set RENDER_WORKER_TOKEN)"
    except Exception:
        token = "(could not read settings)"

    with SessionLocal() as db:
        user = get_or_create_smoke_user(db)
        balance = ensure_render_credits(db, user, RENDER_CREDITS_GRANT)
        scene = get_or_create_smoke_scene(db, user, args.bogus)
        job = _enqueue_job(db, user, scene)
        # Capture all values inside the session to avoid DetachedInstanceError
        user_id = user.id
        job_id = job.id
        model_key = scene.model_key
        credits = job.credits

    path = "BOGUS (failure path)" if args.bogus else "HAPPY (success path)"
    print()
    print(f"[seed] === Smoke job seeded ({path}) ===")
    print(f"[seed] user_id          : {user_id}")
    print(f"[seed] render_credits   : {balance - credits} left, {credits} held by the job")
    print(f"[seed] job_id           : {job_id}")
    print(f"[seed] model_key        : {model_key}")
    print(f"[seed] RENDER_WORKER_TOKEN (server): {token}")
    print()
    print("A worker claims it with POST /render-jobs/claim, X-Worker-Token and")
    print('{"worker_id": "smoke", "kinds": ["still"]} (docs/adr/0005-server-exports.md).')


if __name__ == "__main__":
    main()
