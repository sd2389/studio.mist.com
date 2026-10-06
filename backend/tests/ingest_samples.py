"""Bulk upload tests (docs/adr/0006-bulk-pipeline.md): cloud storage in memory, owners on each
plan, batch requests, and a worker that converts designs."""

import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from image_samples import raster
from model_samples import REAL_GLB

from app.core import storage as storage_mod
from app.core.adapters.errors import StorageObjectTooLargeError
from app.features.billing.quota_service import get_or_create_billing, reset_allotments
from app.features.render_jobs import outputs, worker
from app.main import app
from app.models import FeatureFlag, IngestBatch, IngestItem, RenderJob, User
from app.models.user import Session as DbSession
from app.schemas.render_job import RenderJobCompleteRequest

SIGNED = "https://r2.example.com/"
WORKER_SETTINGS = SimpleNamespace(render_job_lease_seconds=120, render_worker_token="secret")
RENDERER = {"browser": "Chrome/149 HeadlessChrome", "backend": "webgl2", "adapter": None}
THUMBNAIL = raster("WEBP", (512, 512))
# The ADR's default stills: four 2000 px angles, a render credit each.
STILLS_PLAN = {"stills": {"angles": ["front", "three-quarter", "side", "top"], "size": 2000}}


class MemoryCloud:
    """Cloud storage as bulk uploads use it: signed PUTs that hold their size, signed GETs,
    objects in memory."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.signed_puts: dict[str, dict] = {}

    def presign_put(self, key, content_type, expires_in=900, *, content_length=None, content_disposition=None) -> str:
        self.signed_puts[key] = {
            "type": content_type, "expires": expires_in, "length": content_length, "disposition": content_disposition,
        }
        return f"{SIGNED}{key}?put"

    def presign_get(self, key: str, expires_in: int = 900) -> str:
        return f"{SIGNED}{key}?get&expires={expires_in}"

    def put(self, url: str, headers: dict[str, str], data: bytes) -> int:
        """A browser's PUT to a signed URL: 403, as the storage answers, unless it sends the
        headers the URL signs and a body of the size it signs."""
        key = url.removeprefix(SIGNED).removesuffix("?put")
        signed = self.signed_puts.get(key)
        if signed is None or len(data) != signed["length"] or headers.get("Content-Length") != str(len(data)):
            return 403
        if headers.get("Content-Type") != signed["type"]:
            return 403
        self.objects[key] = data
        return 200

    def put_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None:
        self.objects[key] = data

    def get_bytes(self, key: str, max_bytes: int | None = None) -> bytes:
        if key not in self.objects:
            raise HTTPException(status_code=404, detail="Uploaded file not found")
        if max_bytes is not None and len(self.objects[key]) > max_bytes:
            raise StorageObjectTooLargeError(f"{key} is larger than {max_bytes} bytes")
        return self.objects[key]

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)

    def exists(self, key: str) -> bool:
        return key in self.objects

    def size(self, key: str) -> int | None:
        return len(self.objects[key]) if key in self.objects else None

    def local_file_if_exists(self, key: str) -> None:
        return None

    def copy_object(self, source_key: str, dest_key: str, *, dest_bucket: str | None = None) -> None:
        self.objects[dest_key] = self.objects[source_key]

    def under(self, prefix: str) -> list[str]:
        return sorted(key for key in self.objects if key.startswith(prefix))


@pytest.fixture()
def cloud(monkeypatch) -> MemoryCloud:
    backend = MemoryCloud()
    monkeypatch.setattr(storage_mod, "get_storage", lambda: backend)
    monkeypatch.setattr(storage_mod, "get_public_storage", lambda: None)
    return backend


def set_flag(db, key: str, enabled: bool) -> None:
    db.merge(FeatureFlag(key=key, enabled=enabled, updated_at=datetime.utcnow()))
    db.commit()


@pytest.fixture()
def client(db, cloud):
    """The API with bulk uploads turned on."""
    from app.database import get_db

    def _override_db():
        yield db

    set_flag(db, "bulk_pipeline", True)
    app.dependency_overrides[get_db] = _override_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def sign_in(db, email: str, tier: str = "studio") -> tuple[User, dict[str, str]]:
    now = datetime.utcnow()
    user = User(email=email, password_hash="hash", role="user", created_at=now, updated_at=now)
    db.add(user)
    db.commit()
    reset_allotments(db, get_or_create_billing(db, user), tier)
    db.add(DbSession(token=f"session-{user.id}", user_id=user.id, expires_at=now + timedelta(days=1)))
    db.commit()
    return user, {"Authorization": f"Bearer session-{user.id}"}


@pytest.fixture()
def owner(db) -> tuple[User, dict[str, str]]:
    return sign_in(db, "studio@example.com")


@pytest.fixture()
def other(db) -> tuple[User, dict[str, str]]:
    return sign_in(db, "other@example.com")


def balances(db, user: User) -> tuple[int, int]:
    """(model credits, render credits) left."""
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.model_credits_balance, billing.render_credits_balance


def design(filename: str = "rings/R-1.stl", size: int = 1000, **fields) -> dict:
    return {"filename": filename, "bytes": size, **fields}


def designs(count: int, prefix: str = "R") -> list[dict]:
    return [design(f"rings/{prefix}-{number}.stl", 1000 + number) for number in range(1, count + 1)]


def batch_body(*items: dict, **fields) -> dict:
    return {"name": "Autumn rings", "items": list(items) or [design()], **fields}


def create(client, headers: dict[str, str], body: dict, **request):
    return client.post("/ingest/batches", headers=headers, json=body, **request)


def problems(res) -> list[dict]:
    assert res.status_code == 422, res.text
    return res.json()["detail"]["problems"]


def file_bodies(batch: dict) -> dict[int, bytes]:
    """Bytes for each design's CAD file, of its declared size."""
    return {item["id"]: b"x" * item["bytes"] for item in batch["items"]}


def upload_all(client, headers: dict[str, str], cloud: MemoryCloud, batch: dict, *, confirm: bool = True) -> None:
    """Sign every design's files and PUT each one of its declared size, as the browser does."""
    sizes = {(item["id"], item["filename"]): item["bytes"] for item in batch["items"]}
    sizes |= {(item["id"], file["filename"]): file["bytes"] for item in batch["items"] for file in item["companions"]}
    ids = [item["id"] for item in batch["items"]]
    for start in range(0, len(ids), 100):
        signed = client.post(f"/ingest/batches/{batch['id']}/uploads", headers=headers, json={"item_ids": ids[start : start + 100]})
        assert signed.status_code == 200, signed.text
        for file in signed.json()["files"]:
            body = b"x" * sizes[(file["item_id"], file["filename"])]
            assert cloud.put(file["url"], file["headers"], body) == 200
        if confirm:
            res = client.post(f"/ingest/batches/{batch['id']}/uploaded", headers=headers, json={"item_ids": ids[start : start + 100]})
            assert res.status_code == 200 and res.json()["missing"] == [], res.text


def submitted_batch(client, headers, cloud, body: dict | None = None) -> dict:
    """A batch made, uploaded and submitted: its designs converting."""
    res = create(client, headers, body or batch_body())
    assert res.status_code == 201, res.text
    batch = res.json()
    upload_all(client, headers, cloud, batch)
    submitted = client.post(f"/ingest/batches/{batch['id']}/submit", headers=headers)
    assert submitted.status_code == 200, submitted.text
    return {**batch, **submitted.json()}


def claim(db) -> RenderJob | None:
    return worker.claim_job(db, "cpu-a-1", ["convert"], WORKER_SETTINGS)


def conversion_report(**fields) -> dict:
    """conversion.json for the demo ring, as the convert mode writes it."""
    return {
        "model_config": {
            "source": "upload-ingest",
            "slots": [{"slotId": "Metal 1", "kind": "metal"}, {"slotId": "Gem 1", "kind": "gem"}],
        },
        "slot_selections": {"Metal 1": "gold-18k-yellow", "Gem 1": "diamond"},
        "polygon_count": 680,
        "units": {"mm_per_unit": 1.0, "source": "declared", "size_mm": [21.0, 20.5, 8.5]},
        "roles": {"Metal 1": "metal", "Gem 1": "gem"},
        "warnings": ["Layer 'Notes' was skipped."],
        **fields,
    }


def converted_files(
    cloud: MemoryCloud, job: RenderJob, *, model: bytes = REAL_GLB, thumbnail: bytes | None = THUMBNAIL, report: dict | bytes | None = None
) -> list[dict]:
    """Store a convert job's files as its worker uploads them, and the outputs complete names."""
    report_bytes = report if isinstance(report, bytes) else json.dumps(report or conversion_report()).encode()
    files = [("model.glb", "model/gltf-binary", model, None), ("conversion.json", "application/json", report_bytes, None)]
    if thumbnail is not None:
        files.append(("thumbnail.webp", "image/webp", thumbnail, 512))
    reports = []
    for name, content_type, data, size in files:
        key = f"customers/{job.user_id}/renders/{job.id}/{name}"
        cloud.objects[key] = data
        reports.append({"name": name, "key": key, "content_type": content_type, "bytes": len(data), "width": size, "height": size})
    return reports


def complete(db, job: RenderJob, reports: list[dict], token: str | None = None) -> RenderJob:
    body = RenderJobCompleteRequest.model_validate({"outputs": reports, "renderer": RENDERER})
    return outputs.complete_job(db, job.id, token or job.worker_token, body)


def fail(db, job: RenderJob, code: str = "model_unreadable", retryable: bool = False) -> RenderJob:
    return worker.fail_job(db, job.id, job.worker_token, error=f"{code}!", code=code, retryable=retryable)


def item_row(db, item_id: int) -> IngestItem:
    db.expire_all()
    return db.get(IngestItem, item_id)


def batch_row(db, batch_id: int) -> IngestBatch:
    db.expire_all()
    return db.get(IngestBatch, batch_id)
