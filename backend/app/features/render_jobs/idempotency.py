"""Idempotency-Key for creating render jobs (docs/adr/0005-server-exports.md, "Idempotency").

The same key with the same request answers the jobs the first request made; with another
request it is 409. A single create keeps the key on its job. The jobs of a bulk request each
keep a digest of the key with their place in the request, so every job's key stays unique (one
index per user) and fits the column whatever the key's length.
"""

from __future__ import annotations

import hashlib
import json
import re

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import RenderJob

_IDEMPOTENCY_KEY = re.compile(r"[\x21-\x7e]{1,128}")


def check_key(key: str | None) -> None:
    if key is not None and not _IDEMPOTENCY_KEY.fullmatch(key):
        raise HTTPException(status_code=400, detail="Idempotency-Key: 1 to 128 visible ASCII characters")


def request_hash(body: BaseModel) -> str:
    """SHA-256 of the request as canonical JSON, so the same body hashes the same however it is written."""
    canonical = json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _bulk_prefix(key: str) -> str:
    return f"bulk:{hashlib.sha256(key.encode()).hexdigest()}:"


def bulk_job_keys(key: str, count: int) -> list[str]:
    """What each of a bulk request's `count` jobs keeps of its key."""
    prefix = _bulk_prefix(key)
    return [f"{prefix}{index}" for index in range(count)]


def earlier_jobs(db: Session, user_id: int, key: str, body_hash: str, *, bulk: bool) -> list[RenderJob]:
    """The jobs an earlier request with this key made, in the order it made them; none for a
    new key. 409 when that request had another body, or was a bulk request where this one is a
    single create, or the other way round."""
    jobs = list(
        db.execute(
            select(RenderJob)
            .where(
                RenderJob.user_id == user_id,
                or_(
                    RenderJob.idempotency_key == key,
                    RenderJob.idempotency_key.startswith(_bulk_prefix(key), autoescape=True),
                ),
            )
            .order_by(RenderJob.id)
        ).scalars()
    )
    made_by_bulk = bool(jobs) and jobs[0].idempotency_key != key
    if jobs and (made_by_bulk != bulk or any(job.request_hash != body_hash for job in jobs)):
        raise HTTPException(status_code=409, detail="Idempotency-Key was already used for another request")
    return jobs
