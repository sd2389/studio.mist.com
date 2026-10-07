"""CLI for `npm run worker:smoke-convert` (scripts/render-worker/smoke-convert.mjs): what a bulk
upload needs on this machine that the API's routes can't give it here.

A bulk upload's files go straight to cloud storage through signed PUTs, which local storage can't
sign (POST /ingest/batches/{id}/uploads answers 503). Everything else runs through the API as it
does for a customer: the smoke creates the batch, confirms its uploads, submits it, and reads its
designs and their scenes over HTTP. This script does the rest, on the smoke's throwaway database:

    seed                create the tables, turn the bulk_pipeline flag on, and sign in a Studio
                        user. The last line printed is JSON: {"token", "user_id"}.
    put BATCH FILES     store each design's files of batch BATCH where their signed PUTs would
                        have put them. FILES is a JSON object: each file's name as dropped (the
                        design's filename, or a companion's) to the file on this machine.
    cap JOB N [--fail]  give queued convert job JOB a polygon cap of N (and decimate "fail"), as
                        a plan with that cap would: the smoke's designs are far below any plan's.

Usage, from backend/, with DATABASE_URL, STORAGE_BACKEND=local and UPLOAD_DIR set:
    python -m scripts.seed_convert_smoke seed
"""

from __future__ import annotations

import argparse
import json
import secrets
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from app.core import storage
from app.database import SessionLocal, engine
from app.features.billing.quota_service import get_or_create_billing, reset_allotments
from app.models import Base, IngestItem, RenderJob, User
from app.models.feature_flag import FeatureFlag
from app.models.user import Session as DbSession

SMOKE_EMAIL = "convert-smoke@devjewels.test"
SESSION_HOURS = 2


def seed() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        now = datetime.utcnow()
        db.merge(FeatureFlag(key="bulk_pipeline", enabled=True, updated_at=now))
        user = User(email=SMOKE_EMAIL, password_hash="!", role="user", created_at=now, updated_at=now)
        db.add(user)
        db.commit()
        # Studio: bulk uploads, and model credits for every design.
        reset_allotments(db, get_or_create_billing(db, user), "studio")
        token = secrets.token_urlsafe(32)
        db.add(DbSession(token=token, user_id=user.id, expires_at=now + timedelta(hours=SESSION_HOURS), created_at=now))
        db.commit()
        print(json.dumps({"token": token, "user_id": user.id}))


def put(batch_id: int, files: dict[str, str]) -> None:
    with SessionLocal() as db:
        items = db.execute(select(IngestItem).where(IngestItem.batch_id == batch_id)).scalars().all()
        if not items:
            raise SystemExit(f"batch {batch_id} has no designs")
        for item in items:
            stored = [(item.filename, item.source_key)] + [(file["filename"], file["key"]) for file in item.companions]
            for filename, key in stored:
                if filename not in files:
                    raise SystemExit(f"no file given for {filename}")
                storage.write_bytes(key, Path(files[filename]).read_bytes())


def cap(job_id: int, max_polygons: int, fail: bool) -> None:
    with SessionLocal() as db:
        job = db.get(RenderJob, job_id)
        if job is None or job.kind != "convert" or job.status != "queued":
            raise SystemExit(f"job {job_id} is not a queued convert job")
        # A new dict: the column is plain JSON, so a change made in place isn't saved.
        job.spec = {**job.spec, "max_polygons": max_polygons, "decimate": "fail" if fail else job.spec["decimate"]}
        db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("seed")
    put_command = commands.add_parser("put")
    put_command.add_argument("batch_id", type=int)
    put_command.add_argument("files", type=json.loads)
    cap_command = commands.add_parser("cap")
    cap_command.add_argument("job_id", type=int)
    cap_command.add_argument("max_polygons", type=int)
    cap_command.add_argument("--fail", action="store_true")
    args = parser.parse_args()
    if args.command == "seed":
        seed()
    elif args.command == "put":
        put(args.batch_id, args.files)
    else:
        cap(args.job_id, args.max_polygons, args.fail)


if __name__ == "__main__":
    main()
