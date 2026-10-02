"""Render-job worker routes over HTTP.

The per-job token travels in the X-Job-Token header, never in the URL (access
logs keep URLs), and the claim tells the worker how long its lease lasts.
"""

from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.features.billing.quota_service import get_or_create_billing
from app.main import app
from app.models.render_job import RenderJob

WORKER_TOKEN = "worker-secret-for-tests"
LEASE_SECONDS = 900


@pytest.fixture()
def client(db):
    from app.database import get_db

    def _override_db():
        yield db

    settings = get_settings().model_copy(
        update={"render_worker_token": WORKER_TOKEN, "render_job_lease_seconds": LEASE_SECONDS}
    )
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_settings] = lambda: settings
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def job(db, sample_user) -> RenderJob:
    now = datetime.utcnow()
    row = RenderJob(
        user_id=sample_user.id,
        model_ref="https://cdn.example.com/ring.glb",
        lighting="studio",
        preset="gold-18k-yellow",
        width=512,
        height=512,
        status="queued",
        attempts=0,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _claim(client) -> dict:
    res = client.post("/render-jobs/claim", headers={"X-Worker-Token": WORKER_TOKEN})
    assert res.status_code == 200
    return res.json()


def test_claim_returns_page_token_and_lease(client, job):
    claimed = _claim(client)

    assert claimed["job_id"] == job.id
    assert claimed["page_token"] == job.worker_token
    assert claimed["lease_seconds"] == LEASE_SECONDS


def test_payload_takes_the_token_from_the_header(client, job):
    claimed = _claim(client)

    res = client.get(f"/render-jobs/{job.id}/payload", headers={"X-Job-Token": claimed["page_token"]})

    assert res.status_code == 200
    assert res.json()["model_url"] == "https://cdn.example.com/ring.glb"


@pytest.mark.parametrize(("tier", "watermark"), [("free", True), ("grow", False), ("studio", False)])
def test_payload_says_whether_the_owner_plan_watermarks(client, db, sample_user, job, tier, watermark):
    billing = get_or_create_billing(db, sample_user)
    billing.plan_tier = tier
    db.commit()
    claimed = _claim(client)

    res = client.get(f"/render-jobs/{job.id}/payload", headers={"X-Job-Token": claimed["page_token"]})

    assert res.json()["watermark"] is watermark


def test_token_in_the_query_string_is_not_accepted(client, job):
    claimed = _claim(client)

    res = client.get(f"/render-jobs/{job.id}/payload", params={"token": claimed["page_token"]})

    assert res.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "kwargs"),
    [
        ("get", "payload", {}),
        ("post", "complete", {"files": {"file": ("render.png", b"PNG", "image/png")}}),
        ("post", "fail", {"json": {"error": "boom"}}),
    ],
)
def test_job_endpoints_refuse_a_missing_token(client, job, method, path, kwargs):
    _claim(client)

    res = getattr(client, method)(f"/render-jobs/{job.id}/{path}", **kwargs)

    assert res.status_code == 401


def test_complete_takes_the_token_from_the_header(client, job):
    claimed = _claim(client)

    with patch("app.features.render_jobs.service.write_bytes"):
        res = client.post(
            f"/render-jobs/{job.id}/complete",
            headers={"X-Job-Token": claimed["page_token"]},
            files={"file": ("render.png", b"PNG", "image/png")},
        )

    assert res.status_code == 200
    assert res.json()["status"] == "completed"


def test_fail_takes_the_token_from_the_header(client, job):
    claimed = _claim(client)

    res = client.post(
        f"/render-jobs/{job.id}/fail",
        headers={"X-Job-Token": claimed["page_token"]},
        json={"error": "boom"},
    )

    assert res.status_code == 200
    assert res.json()["status"] == "queued"


def test_cors_preflight_lets_the_harness_send_the_header(client):
    """The harness page calls the API cross-origin, so X-Job-Token needs a passing preflight."""
    res = client.options(
        "/render-jobs/1/payload",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-job-token",
        },
    )

    assert res.status_code == 200
    assert "x-job-token" in res.headers["access-control-allow-headers"].lower()
