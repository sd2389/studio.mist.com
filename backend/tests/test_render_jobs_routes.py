"""Render-job worker routes over HTTP (docs/adr/0005-server-exports.md, "Endpoints for workers").

The claim takes X-Worker-Token and the worker's kinds; every other call takes only the job's own
token, in the X-Job-Token header, never in the URL (access logs keep URLs). Request bodies are
strict, and a job runs from claim to complete through these routes alone.
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import storage as storage_mod
from app.core.storage.local import LocalBackend
from app.features.billing.quota_service import get_or_create_billing
from app.features.render_jobs.service import create_job
from app.main import app
from app.models import RenderJob, Scene
from app.schemas.render_job import RenderJobCreate

WORKER_TOKEN = "worker-secret-for-tests"
CLAIM = {"worker_id": "gpu-a-1", "kinds": ["still", "angle_set"]}
PNG = b"\x89PNG\r\n\x1a\n" + b"pixels" * 8
RENDERER = {
    "browser": "Mozilla/5.0 HeadlessChrome/149.0",
    "backend": "webgpu",
    "adapter": {"vendor": "nvidia", "architecture": "ada", "device": "L4", "description": ""},
}


@pytest.fixture()
def files(tmp_path, monkeypatch) -> LocalBackend:
    backend = LocalBackend(tmp_path)
    monkeypatch.setattr(storage_mod, "get_storage", lambda: backend)
    return backend


@pytest.fixture()
def client(db, files):
    from app.database import get_db

    def _override_db():
        yield db

    settings = get_settings().model_copy(update={"render_worker_token": f"old-token,{WORKER_TOKEN}"})
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_settings] = lambda: settings
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def job(db, sample_user) -> RenderJob:
    now = datetime.utcnow()
    scene = Scene(
        user_id=sample_user.id,
        model_key=f"customers/{sample_user.id}/models/ring.glb",
        name="Ring",
        sku="RING-7",
        created_at=now,
        updated_at=now,
    )
    db.add(scene)
    db.commit()
    body = RenderJobCreate(
        kind="still", scene_id=scene.id, spec={"camera": {"pose": "pose-default"}, "width": 512, "height": 512}
    )
    created, _ = create_job(db, sample_user, body)
    return created


def _claim(client, token: str = WORKER_TOKEN) -> dict:
    res = client.post("/render-jobs/claim", headers={"X-Worker-Token": token}, json=CLAIM)
    assert res.status_code == 200
    return res.json()


def _as_job(claimed: dict) -> dict[str, str]:
    return {"X-Job-Token": claimed["job_token"]}


def test_a_claim_answers_the_job_its_token_and_its_lease(client, job):
    claimed = _claim(client)

    assert claimed == {
        "job_id": job.id, "job_token": claimed["job_token"], "kind": "still", "lease_seconds": 120, "heartbeat_seconds": 20,
    }
    assert client.post("/render-jobs/claim", headers={"X-Worker-Token": WORKER_TOKEN}, json=CLAIM).status_code == 204


def test_the_old_token_still_claims_while_a_new_one_rotates_in(client, job):
    assert _claim(client, token="old-token")["job_id"] == job.id


@pytest.mark.parametrize(
    "body",
    [
        {"kinds": ["still"]},
        {"worker_id": "gpu a 1", "kinds": ["still"]},
        {"worker_id": "gpu-a-1", "kinds": []},
        {"worker_id": "gpu-a-1", "kinds": ["poster"]},
        {"worker_id": "gpu-a-1", "kinds": ["still"], "priority": 100},
    ],
)
def test_a_claim_body_is_strict(client, job, body):
    res = client.post("/render-jobs/claim", headers={"X-Worker-Token": WORKER_TOKEN}, json=body)

    assert res.status_code == 422


def test_a_claim_needs_the_worker_token(client, job):
    assert client.post("/render-jobs/claim", json=CLAIM).status_code == 401
    assert client.post("/render-jobs/claim", headers={"X-Worker-Token": "nope"}, json=CLAIM).status_code == 401


def test_the_token_in_the_query_string_is_not_accepted(client, job):
    claimed = _claim(client)

    res = client.get(f"/render-jobs/{job.id}/payload", params={"token": claimed["job_token"]})

    assert res.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "kwargs"),
    [
        ("get", "payload", {}),
        ("get", "inputs/model", {}),
        ("get", "inputs/background", {}),
        ("post", "heartbeat", {"json": {}}),
        ("post", "uploads", {"json": {"files": [{"name": "RING-7.png", "content_type": "image/png", "bytes": 1}]}}),
        ("put", "uploads/RING-7.png", {"content": PNG, "headers": {"Content-Type": "image/png"}}),
        ("post", "complete", {"json": {"outputs": [{"name": "RING-7.png", "key": "k", "content_type": "image/png", "bytes": 1}], "renderer": RENDERER}}),
        ("post", "fail", {"json": {"error": "boom", "code": "unknown", "retryable": True}}),
    ],
)
def test_every_job_endpoint_refuses_a_missing_or_wrong_token(client, job, method, path, kwargs):
    _claim(client)

    missing = getattr(client, method)(f"/render-jobs/{job.id}/{path}", **kwargs)
    headers = {**kwargs.pop("headers", {}), "X-Job-Token": "not-the-token"}
    wrong = getattr(client, method)(f"/render-jobs/{job.id}/{path}", headers=headers, **kwargs)

    assert (missing.status_code, wrong.status_code) == (401, 401)


def test_the_payload_comes_as_the_harness_reads_it(client, job):
    claimed = _claim(client)

    payload = client.get(f"/render-jobs/{job.id}/payload", headers=_as_job(claimed)).json()

    assert set(payload) == {"kind", "spec", "look", "look_items", "model", "watermark", "limits", "scene"}
    assert payload["spec"]["output_names"] == ["RING-7.png"]
    assert payload["model"] == {"path": f"/render-jobs/{job.id}/inputs/model"}
    assert payload["limits"] == {"max_edge": 512, "max_runtime_seconds": 300}
    assert payload["scene"] == {"id": job.scene_id, "name": "Ring", "sku": "RING-7"}


@pytest.mark.parametrize(("tier", "watermark"), [("free", True), ("grow", False), ("studio", False)])
def test_the_payload_carries_the_watermark_the_plan_gave_the_job(client, db, sample_user, tier, watermark):
    """The owner's plan decides the mark when the job is created; a plan change later doesn't move it."""
    scene = Scene(user_id=sample_user.id, model_key="customers/1/models/ring.glb", created_at=datetime.utcnow())
    db.add(scene)
    billing = get_or_create_billing(db, sample_user)
    billing.plan_tier = tier
    db.commit()
    body = RenderJobCreate(
        kind="still", scene_id=scene.id, spec={"camera": {"pose": "pose-default"}, "width": 512, "height": 512}
    )
    job, _ = create_job(db, sample_user, body)
    billing.plan_tier = "studio" if tier == "free" else "free"
    db.commit()
    claimed = _claim(client)

    res = client.get(f"/render-jobs/{job.id}/payload", headers=_as_job(claimed))

    assert res.json()["watermark"] is watermark


@pytest.mark.parametrize(
    "body",
    [{"progress": 1.5}, {"progress": "0.5"}, {"stage": "baking"}, {"progress": 0.5, "eta": 3}],
)
def test_a_heartbeat_body_is_strict(client, job, body):
    claimed = _claim(client)

    assert client.post(f"/render-jobs/{job.id}/heartbeat", headers=_as_job(claimed), json=body).status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"error": "boom", "code": "lease_expired", "retryable": True},
        {"error": "boom", "code": "unknown", "retryable": "yes"},
        {"error": "", "code": "unknown", "retryable": True},
        {"error": "boom", "code": "unknown"},
    ],
)
def test_a_fail_body_is_strict(client, job, body):
    claimed = _claim(client)

    assert client.post(f"/render-jobs/{job.id}/fail", headers=_as_job(claimed), json=body).status_code == 422


def test_a_job_runs_from_claim_to_complete_over_http(client, db, files, job):
    """Local storage: the model and the outputs go through the API, with the job's token."""
    files.put_bytes(f"customers/{job.user_id}/models/ring.glb", b"glTF-binary")
    claimed = _claim(client)
    token = _as_job(claimed)

    model = client.get(f"/render-jobs/{job.id}/inputs/model", headers=token)
    beat = client.post(f"/render-jobs/{job.id}/heartbeat", headers=token, json={"progress": 0.5, "stage": "rendering"})
    uploads = client.post(
        f"/render-jobs/{job.id}/uploads",
        headers=token,
        json={"files": [{"name": "RING-7.png", "content_type": "image/png", "bytes": len(PNG)}]},
    ).json()["files"]
    put = client.put(uploads[0]["url"], headers={**token, **uploads[0]["headers"]}, content=PNG)
    done = client.post(
        f"/render-jobs/{job.id}/complete",
        headers=token,
        json={
            "outputs": [{
                "name": "RING-7.png", "key": uploads[0]["key"], "content_type": "image/png", "bytes": len(PNG),
                "width": 512, "height": 512, "label": "pose-default",
            }],
            "renderer": RENDERER,
        },
    )

    assert (model.status_code, model.content, model.headers["content-type"]) == (200, b"glTF-binary", "model/gltf-binary")
    assert (beat.status_code, beat.json()["cancel"]) == (200, False)
    assert beat.json()["lease_expires_at"].endswith("Z")
    assert uploads[0]["url"] == f"/render-jobs/{job.id}/uploads/RING-7.png"
    assert put.status_code == 204
    assert done.status_code == 200
    assert done.json() == {"id": job.id, "status": "completed", "attempts": 1, "error": None, "error_code": None}
    db.refresh(job)
    assert (job.credit_state, job.renderer["adapter"]["device"]) == ("charged", "L4")


def test_fail_answers_what_became_of_the_job(client, job):
    claimed = _claim(client)

    res = client.post(
        f"/render-jobs/{job.id}/fail",
        headers=_as_job(claimed),
        json={"error": "GPU lost", "code": "gpu_lost", "retryable": True},
    )

    assert res.status_code == 200
    assert res.json() == {"id": job.id, "status": "queued", "attempts": 1, "error": "GPU lost", "error_code": "gpu_lost"}


def test_an_encoder_failure_is_tried_again(client, job):
    """ffmpeg failing on a turntable's MP4 (out of memory, killed) may well work on another try."""
    claimed = _claim(client)

    res = client.post(
        f"/render-jobs/{job.id}/fail",
        headers=_as_job(claimed),
        json={"error": "ffmpeg exited with code 1", "code": "encode_failed", "retryable": True},
    )

    assert res.status_code == 200
    assert (res.json()["status"], res.json()["error_code"]) == ("queued", "encode_failed")
