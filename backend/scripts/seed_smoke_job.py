"""CLI: create (or reuse) a smoke-test user + billing, then enqueue a RenderJob.

Idempotent on the user: if a user with SMOKE_EMAIL already exists, it is
reused.  The job is always created fresh so you can run the script multiple
times to queue additional jobs.

Usage (inside the backend container):
    python -m scripts.seed_smoke_job
    python -m scripts.seed_smoke_job --bogus   # bogus model_ref for failure path

Expected env vars in the container:
    DATABASE_URL  (standard — already set by docker-compose)
    RENDER_WORKER_TOKEN  (the shared secret; echoed back so you know it's set)
"""

from __future__ import annotations

import argparse
from datetime import datetime

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.features.billing.quota_service import get_or_create_billing
from app.models.billing import UserBilling
from app.models.render_job import RenderJob
from app.models.user import User

SMOKE_EMAIL = "smoke@devjewels.test"
SMOKE_PASSWORD = "smoke-password-not-for-prod"
SMOKE_NAME = "Smoke Tester"
RENDER_CREDITS_GRANT = 5

# Happy-path model: dev web server serves test fixtures on localhost:3000
HAPPY_MODEL_REF = "http://localhost:3000/test-fixtures/PDR-2413.glb"
# Bogus model ref (will 404 when the worker browser tries to load it)
BOGUS_MODEL_REF = "http://localhost:3000/does-not-exist.glb"


def _get_or_create_smoke_user(db) -> User:
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


def _ensure_render_credits(db, user: User, amount: int) -> int:
    """Ensure billing row exists and set render_credits_balance to `amount`.

    Returns the balance after the operation.
    """
    billing: UserBilling = get_or_create_billing(db, user)
    billing.render_credits_balance = amount
    billing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(billing)
    return billing.render_credits_balance


def _enqueue_job(db, user: User, model_ref: str) -> RenderJob:
    now = datetime.utcnow()
    job = RenderJob(
        user_id=user.id,
        scene_id=None,
        model_ref=model_ref,
        lighting="studio",
        preset="gold-18k-yellow",
        width=1024,
        height=1024,
        status="queued",
        attempts=0,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed a smoke RenderJob for end-to-end testing."
    )
    parser.add_argument(
        "--bogus",
        action="store_true",
        help="Use a bogus model_ref (failure path smoke test)",
    )
    args = parser.parse_args()

    model_ref = BOGUS_MODEL_REF if args.bogus else HAPPY_MODEL_REF

    # Echo the configured token so the operator can sanity-check
    try:
        from app.config import get_settings
        token = get_settings().render_worker_token or "(NOT SET — set RENDER_WORKER_TOKEN)"
    except Exception:
        token = "(could not read settings)"

    with SessionLocal() as db:
        user = _get_or_create_smoke_user(db)
        balance = _ensure_render_credits(db, user, RENDER_CREDITS_GRANT)
        job = _enqueue_job(db, user, model_ref)
        # Capture all values inside the session to avoid DetachedInstanceError
        user_id = user.id
        job_id = job.id
        job_model_ref = job.model_ref
        job_worker_token = job.worker_token

    path = "BOGUS (failure path)" if args.bogus else "HAPPY (success path)"
    print()
    print(f"[seed] === Smoke job seeded ({path}) ===")
    print(f"[seed] user_id          : {user_id}")
    print(f"[seed] render_credits   : {balance}")
    print(f"[seed] job_id           : {job_id}")
    print(f"[seed] model_ref        : {job_model_ref}")
    print(f"[seed] worker_token     : {job_worker_token}")
    print(f"[seed] RENDER_WORKER_TOKEN (server): {token}")
    print()
    print("Next step — run the worker:")
    print(
        f"  RENDER_WORKER_TOKEN=smoketoken RENDER_API_URL=http://localhost:8765 "
        f"npm run worker:render -- --once"
    )


if __name__ == "__main__":
    main()
