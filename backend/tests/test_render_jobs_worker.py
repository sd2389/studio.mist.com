"""Render jobs for workers (docs/adr/0005-server-exports.md, A2).

- Worker tokens: a list, compared in constant time; 503 unset, 401 wrong.
- Claims: the kinds asked for, the highest priority then the oldest, past their backoff, within
  each owner's running cap; a fresh token and a lease each time.
- Leases: a lease lives only as long as its heartbeats; a lapsed lease is taken back as a failed
  attempt, retried after a backoff, refunded when it was the last; its old token is refused.
- Heartbeats: extend the lease within the kind's run time, record progress, carry cancel.
- Payload: the spec, the look and its items, the model, the watermark, the limits; a background
  image signed into the payload's copy only; a missing input ends the job refunded.
- Uploads and complete: signed or local uploads of the files the spec names; complete checks the
  prefix, the names and the stored sizes, creates the renders, charges once, counts storage.
- Turntables and spins: their own frame counts in the payload, one MP4 or one ZIP each, and
  their kinds' run times.
- Fail: a code, a retryable flag and backoff; a final failure refunds.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pack_samples import DEFAULT_PACK
from sqlalchemy.dialects import postgresql

from app.core import storage as storage_mod
from app.core.storage.local import LocalBackend
from app.features.billing.quota_service import count_storage_bytes, get_or_create_billing, reset_allotments
from app.features.render_jobs import outputs, service, worker
from app.features.render_jobs import payload as payloads
from app.models import Render, RenderJob, Scene, User, UserAsset
from app.schemas.render_job import RenderJobCompleteRequest, RenderJobUploadFile

T0 = datetime(2026, 10, 5, 12, 0, 0)
SETTINGS = SimpleNamespace(render_job_lease_seconds=120, render_worker_token="secret")
KINDS = ("still", "angle_set")
VIEW = {"view": {"position": [0.62, 0.88, 2.25], "target": [0, 0, 0]}}
STILL = {"camera": VIEW, "width": 2048, "height": 1024}  # 1 credit
ANGLE_SET = {"cameras": [{"angle": "front"}, {"pose": "pose-hero"}, VIEW], "width": 1024, "height": 1024, "format": "jpeg"}
HERO = {"id": "pose-hero", "name": "Hero", "cameraPosition": [1, 1, 1], "target": [0, 0, 0]}
PNG = b"\x89PNG\r\n\x1a\n" + b"render" * 10
RENDERER = {"browser": "Chrome/149 HeadlessChrome", "backend": "webgpu", "adapter": None}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


class Clock:
    """Stands in for `datetime` in the worker modules: utcnow() is the time the test sets."""

    def __init__(self, now: datetime) -> None:
        self.now = now

    def utcnow(self) -> datetime:
        return self.now

    def tick(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


@pytest.fixture(autouse=True)
def clock(monkeypatch) -> Clock:
    clock = Clock(T0)
    for module in (worker, payloads, outputs):
        monkeypatch.setattr(module, "datetime", clock)
    return clock


@pytest.fixture(autouse=True)
def files(tmp_path, monkeypatch) -> LocalBackend:
    backend = LocalBackend(tmp_path)
    monkeypatch.setattr(storage_mod, "get_storage", lambda: backend)
    return backend


class CloudFiles:
    """Cloud storage as the worker protocol uses it: signed URLs, sizes from HEAD, deletes."""

    def __init__(self) -> None:
        self.sizes: dict[str, int] = {}
        self.deleted: list[str] = []
        self.signed_puts: list[dict] = []

    def presign_get(self, key: str, expires_in: int = 900) -> str:
        return f"https://r2.example.com/{key}?get&expires={expires_in}"

    def presign_put(self, key, content_type, expires_in=900, *, content_length=None, content_disposition=None) -> str:
        self.signed_puts.append(
            {"key": key, "type": content_type, "expires": expires_in, "length": content_length, "disposition": content_disposition}
        )
        return f"https://r2.example.com/{key}?put"

    def size(self, key: str) -> int | None:
        return self.sizes.get(key)

    def delete(self, key: str) -> None:
        self.deleted.append(key)

    def local_file_if_exists(self, key: str) -> None:
        return None


@pytest.fixture()
def cloud(monkeypatch) -> CloudFiles:
    backend = CloudFiles()
    monkeypatch.setattr(storage_mod, "get_storage", lambda: backend)
    return backend


def _user(db, email: str = "owner@example.com", tier: str = "free") -> User:
    now = datetime.utcnow()
    user = User(email=email, password_hash="hash", role="user", created_at=now, updated_at=now)
    db.add(user)
    db.commit()
    reset_allotments(db, get_or_create_billing(db, user), tier)
    return user


def _scene(db, user: User, **fields) -> Scene:
    now = datetime.utcnow()
    scene = Scene(
        user_id=user.id,
        model_key=f"customers/{user.id}/models/ring.glb",
        name="Solitaire ring",
        sku=f"RING-{user.id}",
        material="platinum",
        lighting="soft",
        model_config={"slots": [{"slotId": "Metal 1"}]},
        slot_selections={"Metal 1": "platinum"},
        scene_settings={"poses": [HERO], **fields.pop("scene_settings", {})},
        created_at=now,
        updated_at=now,
        **fields,
    )
    db.add(scene)
    db.commit()
    return scene


def _queue(db, user: User, scene: Scene, spec: dict = STILL, kind: str = "still") -> RenderJob:
    from app.schemas.render_job import RenderJobCreate

    job, _ = service.create_job(db, user, RenderJobCreate(kind=kind, scene_id=scene.id, spec=spec))
    return job


@pytest.fixture()
def owner(db) -> User:
    return _user(db)


@pytest.fixture()
def scene(db, owner) -> Scene:
    return _scene(db, owner)


def _claim(db, kinds=KINDS, worker_id: str = "gpu-a-1") -> RenderJob | None:
    return worker.claim_job(db, worker_id, kinds, SETTINGS)


def _balance(db, user: User) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.render_credits_balance


def _storage_used(db, user: User) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.storage_bytes_used


def _status(db, job: RenderJob) -> tuple:
    db.refresh(job)
    return job.status, job.credit_state


def _http_error(call) -> HTTPException:
    with pytest.raises(HTTPException) as exc:
        call()
    return exc.value


def _key(job: RenderJob, name: str) -> str:
    return f"customers/{job.user_id}/renders/{job.id}/{name}"


def _upload(files: LocalBackend, job: RenderJob, name: str, data: bytes = PNG) -> None:
    files.put_bytes(_key(job, name), data)


def _report(job: RenderJob, name: str, *, data: bytes = PNG, **fields) -> dict:
    spec = job.spec
    camera = spec["camera"] if job.kind == "still" else spec["cameras"][spec["output_names"].index(name)]
    return {
        "name": name,
        "key": _key(job, name),
        "content_type": "image/jpeg" if name.endswith(".jpg") else "image/png",
        "bytes": len(data),
        "width": spec["width"],
        "height": spec["height"],
        "label": camera.get("angle") or camera.get("pose"),
        **fields,
    }


def _complete(db, job: RenderJob, reports: list[dict], token: str | None = None) -> RenderJob:
    body = RenderJobCompleteRequest.model_validate({"outputs": reports, "renderer": RENDERER})
    return outputs.complete_job(db, job.id, token or job.worker_token, body)


def _complete_with_uploads(db, files: LocalBackend, job: RenderJob) -> RenderJob:
    for name in job.spec["output_names"]:
        _upload(files, job, name)
    return _complete(db, job, [_report(job, name) for name in job.spec["output_names"]])


def _fail(db, job: RenderJob, code: str = "browser_crashed", retryable: bool = True, token: str | None = None):
    return worker.fail_job(db, job.id, token or job.worker_token, error=f"{code}!", code=code, retryable=retryable)


# ---------------------------------------------------------------------------
# Worker tokens
# ---------------------------------------------------------------------------


def test_the_worker_endpoints_are_off_until_a_token_is_set():
    assert _http_error(lambda: worker.require_worker_token("any", SimpleNamespace(render_worker_token=None))).status_code == 503
    assert _http_error(lambda: worker.require_worker_token("any", SimpleNamespace(render_worker_token=" , "))).status_code == 503


@pytest.mark.parametrize("given", [None, "", "wrong", "secret-but-longer", "tökén"])
def test_a_missing_or_wrong_worker_token_is_401(given):
    assert _http_error(lambda: worker.require_worker_token(given, SETTINGS)).status_code == 401


def test_any_token_of_the_list_claims_so_one_can_be_rotated_in():
    rotating = SimpleNamespace(render_worker_token="old-token, new-token")

    worker.require_worker_token("old-token", rotating)
    worker.require_worker_token("new-token", rotating)
    assert _http_error(lambda: worker.require_worker_token("old-token, new-token", rotating)).status_code == 401


def test_tokens_are_compared_in_constant_time(db, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)

    with patch("app.features.render_jobs.worker.hmac.compare_digest", return_value=False) as compare:
        assert _http_error(lambda: worker.require_worker_token("secret", SETTINGS)).status_code == 401
        assert _http_error(lambda: worker.running_job(db, job.id, job.worker_token)).status_code == 401

    assert compare.call_count == 2


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------


def test_a_claim_starts_an_attempt_with_a_fresh_token_and_a_lease(db, clock, owner, scene):
    job = _queue(db, owner, scene)
    created_token = job.worker_token

    claimed = _claim(db, worker_id="gpu-b-2")

    assert (claimed.id, claimed.status, claimed.attempts, claimed.worker_id) == (job.id, "running", 1, "gpu-b-2")
    assert claimed.worker_token != created_token
    assert claimed.lease_expires_at == T0 + timedelta(seconds=120)
    assert (claimed.started_at, claimed.progress, claimed.stage) == (T0, 0.0, None)
    assert _claim(db) is None


def test_the_lease_is_120_seconds_by_default():
    from app.config import Settings

    assert Settings.model_fields["render_job_lease_seconds"].default == 120


def test_a_claim_takes_the_highest_priority_then_the_oldest(db, owner, scene):
    grower = _user(db, "grow@example.com", tier="grow")
    their_scene = _scene(db, grower)
    batch = _queue(db, grower, their_scene)
    batch.priority = 10
    first, second = _queue(db, owner, scene), _queue(db, grower, their_scene)
    db.commit()

    claimed = [_claim(db).id for _ in range(3)]

    # The owner (Free) runs one job at a time, so the grower's studio job goes before its batch job.
    assert claimed == [first.id, second.id, batch.id]


def test_a_claim_takes_only_the_kinds_the_worker_renders(db, owner, scene):
    job = _queue(db, owner, scene, spec=ANGLE_SET, kind="angle_set")

    assert _claim(db, kinds=["still", "turntable"]) is None
    assert _claim(db, kinds=["angle_set"]).id == job.id


def test_a_claim_waits_out_a_retry_backoff(db, clock, owner, scene):
    job = _queue(db, owner, scene)
    job.run_after = T0 + timedelta(seconds=30)
    db.commit()

    assert _claim(db) is None
    clock.tick(30)
    assert _claim(db).id == job.id


def test_a_claim_keeps_each_owner_within_their_running_cap(db, owner, scene):
    first, second = _queue(db, owner, scene), _queue(db, owner, scene)
    other = _user(db, "other@example.com")
    theirs = _queue(db, other, _scene(db, other))

    assert [_claim(db).id, _claim(db).id] == [first.id, theirs.id]
    assert _claim(db) is None  # Free runs one job at a time
    _complete_with_uploads(db, storage_mod.get_storage(), first)
    assert _claim(db).id == second.id


def test_the_claim_query_skips_locked_rows_on_postgres():
    sql = str(worker._next_job_query(KINDS, T0, {7}, lock=True).compile(dialect=postgresql.dialect()))

    assert "FOR UPDATE OF render_jobs SKIP LOCKED" in sql
    assert "ORDER BY render_jobs.priority DESC, render_jobs.created_at, render_jobs.id" in sql
    # The owner's running jobs, counted for each candidate, against the cap the job keeps.
    assert "FROM render_jobs AS render_jobs_1" in sql
    assert "WHERE render_jobs_1.user_id = render_jobs.user_id AND render_jobs_1.status = " in sql
    assert ") < render_jobs.max_running" in sql


def test_a_claim_counts_an_owners_running_jobs_under_a_lock_on_postgres():
    statements = []

    class _Postgres:
        def execute(self, stmt):
            statements.append(str(stmt.compile(dialect=postgresql.dialect())))
            return SimpleNamespace(scalar_one=lambda: 1)

    assert worker._owner_has_room(_Postgres(), SimpleNamespace(user_id=7, max_running=1)) is False
    assert "pg_advisory_xact_lock" in statements[0]
    assert "count(*)" in statements[1]


# ---------------------------------------------------------------------------
# Leases
# ---------------------------------------------------------------------------


def _heartbeat(db, job: RenderJob, token: str | None = None, **body):
    return worker.heartbeat(db, job.id, token or job.worker_token, progress=body.get("progress"), stage=body.get("stage"), settings=SETTINGS)


def test_a_lease_lives_only_as_long_as_its_heartbeats(db, clock, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)

    for _ in range(9):  # three minutes of heartbeats, every 20 s
        clock.tick(20)
        assert _heartbeat(db, job).lease_expires_at == clock.now + timedelta(seconds=120)
        assert _claim(db) is None
    clock.tick(120)
    assert _claim(db) is None  # the lease ends at the second, not before
    clock.tick(1)
    assert _claim(db) is None  # taken back, and waiting out its backoff

    db.refresh(job)
    assert (job.status, job.error_code) == ("queued", "lease_expired")


def test_a_lapsed_lease_is_taken_back_as_a_failed_attempt(db, clock, owner, scene):
    _queue(db, owner, scene)
    first = _claim(db)
    stale_token = first.worker_token
    clock.tick(121)

    assert _claim(db) is None
    db.refresh(first)
    assert (first.status, first.attempts, first.error, first.error_code) == (
        "queued", 1, worker.LEASE_EXPIRED_ERROR, "lease_expired"
    )
    assert first.run_after == clock.now + timedelta(seconds=30)
    assert first.credit_state == "held"

    clock.tick(30)
    second = _claim(db)
    assert (second.id, second.attempts, second.started_at) == (first.id, 2, clock.now)
    assert second.worker_token != stale_token


def test_the_worker_that_lost_the_lease_is_refused(db, clock, files, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)
    stale_token = job.worker_token
    clock.tick(121)
    _claim(db)  # takes it back
    _upload(files, job, job.spec["output_names"][0])

    for call in (
        lambda: payloads.job_payload(db, job.id, stale_token),
        lambda: _heartbeat(db, job, token=stale_token),
        lambda: outputs.upload_targets(db, job.id, stale_token, []),
        lambda: _complete(db, job, [_report(job, job.spec["output_names"][0])], token=stale_token),
        lambda: _fail(db, job, token=stale_token),
    ):
        assert _http_error(call).status_code == 401


def test_lapsed_leases_keep_the_attempt_limit_and_the_last_one_refunds(db, clock, owner, scene):
    job = _queue(db, owner, scene)
    before = _balance(db, owner)
    for attempt in (1, 2, 3):
        claimed = _claim(db)
        assert (claimed.id, claimed.attempts) == (job.id, attempt)
        clock.tick(121)
        assert _claim(db) is None  # takes the lapsed lease back; the job waits out its backoff
        if attempt < 3:
            assert _status(db, job) == ("queued", "held")
            clock.tick(30 * 2 ** (attempt - 1))

    assert _status(db, job) == ("failed", "refunded")
    assert (job.attempts, job.error_code, job.finished_at) == (3, "lease_expired", clock.now)
    assert _balance(db, owner) == before + 1


def test_a_lapsed_lease_after_a_cancel_request_ends_canceled_and_refunded(db, clock, owner, scene):
    job = _queue(db, owner, scene)
    before = _balance(db, owner)
    _claim(db)
    service.cancel_job(db, owner, job.id)
    clock.tick(121)

    assert _claim(db) is None
    assert _status(db, job) == ("canceled", "refunded")
    assert _balance(db, owner) == before + 1


def test_a_job_ended_by_its_lapsed_lease_does_not_block_the_queue(db, clock, owner, scene):
    stuck = _queue(db, owner, scene)
    _claim(db)
    stuck.attempts = 3
    db.commit()
    clock.tick(121)
    waiting = _queue(db, owner, scene)

    assert _claim(db).id == waiting.id
    assert _status(db, stuck) == ("failed", "refunded")


def test_a_late_worker_can_still_finish_when_nobody_took_the_job_back(db, clock, files, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)
    clock.tick(600)

    assert _complete_with_uploads(db, files, job).status == "completed"


# ---------------------------------------------------------------------------
# Heartbeats
# ---------------------------------------------------------------------------


def test_a_heartbeat_records_progress_and_stage(db, clock, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)
    clock.tick(20)

    answer = _heartbeat(db, job, progress=0.42, stage="rendering")
    _heartbeat(db, job)  # a bare heartbeat keeps what was reported

    db.refresh(job)
    assert (answer.cancel, job.progress, job.stage, job.heartbeat_at) == (False, 0.42, "rendering", clock.now)


def test_a_cancel_shows_up_in_the_next_heartbeat(db, owner, scene):
    job = _queue(db, owner, scene)
    _claim(db)
    assert _heartbeat(db, job).cancel is False

    service.cancel_job(db, owner, job.id)

    assert _heartbeat(db, job).cancel is True
    assert _status(db, job) == ("running", "held")


def test_past_its_run_time_a_job_is_told_to_stop_and_its_lease_runs_out(db, clock, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)
    clock.tick(worker.MAX_RUNTIME_SECONDS["still"] - 20)
    last_lease = _heartbeat(db, job).lease_expires_at

    clock.tick(20)
    answer = _heartbeat(db, job)

    assert (answer.cancel, answer.lease_expires_at) == (True, last_lease)
    clock.tick(121)
    _claim(db)
    assert db.get(RenderJob, job.id).error_code == "lease_expired"


def test_a_heartbeat_needs_the_running_job(db, files, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)
    _complete_with_uploads(db, files, job)

    assert _http_error(lambda: _heartbeat(db, job, token="wrong")).status_code == 401
    assert _http_error(lambda: _heartbeat(db, job)).status_code == 409


def test_every_kind_has_a_run_time_limit():
    from typing import get_args

    from app.schemas.render_job import JobKind

    assert set(worker.MAX_RUNTIME_SECONDS) == set(get_args(JobKind))


# ---------------------------------------------------------------------------
# Payload
# ---------------------------------------------------------------------------


def test_the_payload_is_what_the_harness_reads(db, owner, scene):
    """src/features/render/harness/job-payload.ts on feat/harness-export-a3, field for field."""
    _queue(db, owner, scene)
    job = _claim(db)

    payload = payloads.job_payload(db, job.id, job.worker_token).model_dump(mode="json")

    assert set(payload) == {"kind", "spec", "look", "look_items", "model", "watermark", "limits", "scene"}
    assert payload["kind"] == "still"
    assert payload["spec"] == {
        "camera": VIEW, "width": 2048, "height": 1024, "format": "png", "jpeg_quality": 0.95,
        "transparent": False, "frames": 1, "output_names": ["RING-1.png"],
    }
    assert (payload["look"]["material"], payload["look"]["lighting"]) == ("platinum", "soft")
    assert set(payload["look"]) == {"material", "lighting", "slot_selections", "scene_settings", "model_config"}
    assert set(payload["look_items"]) == {"environments", "backgrounds", "grounds", "metals", "gems", "user_materials"}
    assert payload["model"] == {"path": f"/render-jobs/{job.id}/inputs/model"}
    assert payload["watermark"] is True
    assert payload["limits"] == {"max_edge": 2048, "max_runtime_seconds": 300}
    assert payload["scene"] == {"id": scene.id, "name": "Solitaire ring", "sku": "RING-1"}


def test_on_cloud_storage_the_model_is_a_url_signed_for_15_minutes(db, cloud, owner, scene):
    _queue(db, owner, scene, spec=ANGLE_SET, kind="angle_set")
    job = _claim(db)

    payload = payloads.job_payload(db, job.id, job.worker_token)

    assert payload.model.model_dump() == {"url": f"https://r2.example.com/{scene.model_key}?get&expires=900"}
    assert payload.limits.max_runtime_seconds == 600
    assert payload.spec["output_names"] == ["RING-1-front.jpg", "RING-1-pose-hero.jpg", "RING-1-view-3.jpg"]


def _background(db, user: User, scene: Scene) -> UserAsset:
    key = f"customers/{user.id}/assets/background/{'c' * 32}.webp"
    asset = UserAsset(user_id=user.id, asset_type="background", label="Backdrop", storage_key=key, preview_key=key)
    db.add(asset)
    db.commit()
    scene.scene_settings = {**scene.scene_settings, "customBackground": {"type": "image", "asset_id": asset.id}}
    db.commit()
    return asset


def test_a_background_image_is_signed_into_the_payloads_copy_only(db, cloud, owner, scene):
    asset = _background(db, owner, scene)
    _queue(db, owner, scene)
    job = _claim(db)

    payload = payloads.job_payload(db, job.id, job.worker_token)

    # The harness draws customBackground as a CSS url(), so it gets the address itself.
    assert payload.look["scene_settings"]["customBackground"] == (
        f"https://r2.example.com/{asset.preview_key}?get&expires=900"
    )
    db.refresh(job)
    assert job.look["scene_settings"]["customBackground"] == {"type": "image", "asset_id": asset.id}


def test_on_local_storage_a_background_image_is_streamed_with_the_job_token(db, files, owner, scene):
    asset = _background(db, owner, scene)
    files.put_bytes(asset.preview_key, b"RIFF-backdrop")
    _queue(db, owner, scene)
    job = _claim(db)

    payload = payloads.job_payload(db, job.id, job.worker_token)
    response = payloads.background_file(db, job.id, job.worker_token)

    assert payload.look["scene_settings"]["customBackground"] == f"/render-jobs/{job.id}/inputs/background"
    assert response.path == files.local_file_if_exists(asset.preview_key)
    assert _http_error(lambda: payloads.background_file(db, job.id, "wrong")).status_code == 401


@pytest.mark.parametrize("gone", ["deleted", "someone else's", "not a background"])
def test_a_background_image_that_is_gone_ends_the_job_refunded(db, owner, scene, gone):
    asset = _background(db, owner, scene)
    job = _queue(db, owner, scene)
    before = _balance(db, owner)
    _claim(db)
    if gone == "deleted":
        db.delete(asset)
    elif gone == "someone else's":
        asset.user_id = _user(db, "other@example.com").id
    else:
        asset.asset_type = "metal_env"
    db.commit()

    error = _http_error(lambda: payloads.job_payload(db, job.id, job.worker_token))

    assert error.status_code == 409
    assert "background image" in error.detail
    assert _status(db, job) == ("failed", "refunded")
    assert (job.error_code, _balance(db, owner)) == ("input_missing", before + 1)
    assert _http_error(lambda: _heartbeat(db, job)).status_code == 409


def test_a_deleted_scene_ends_the_job_refunded(db, owner, scene):
    job = _queue(db, owner, scene)
    _claim(db)
    job.scene_id = None
    db.commit()

    assert _http_error(lambda: payloads.job_payload(db, job.id, job.worker_token)).status_code == 409
    assert _status(db, job) == ("failed", "refunded")
    assert job.error_code == "input_missing"


def test_on_local_storage_the_model_is_streamed_with_the_job_token(db, files, owner, scene):
    files.put_bytes(scene.model_key, b"glTF-model")
    _queue(db, owner, scene)
    job = _claim(db)

    response = payloads.model_file(db, job.id, job.worker_token)

    assert (response.path, response.media_type) == (files.local_file_if_exists(scene.model_key), "model/gltf-binary")
    assert _http_error(lambda: payloads.model_file(db, job.id, "wrong")).status_code == 401


def test_on_cloud_storage_the_api_streams_no_inputs(db, cloud, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)

    assert _http_error(lambda: payloads.model_file(db, job.id, job.worker_token)).status_code == 404
    assert _http_error(lambda: payloads.background_file(db, job.id, job.worker_token)).status_code == 404


def test_a_job_that_is_not_running_has_no_payload(db, owner, scene):
    job = _queue(db, owner, scene)

    assert _http_error(lambda: payloads.job_payload(db, job.id, job.worker_token)).status_code == 409
    assert _http_error(lambda: payloads.job_payload(db, 999, "token")).status_code == 404


# ---------------------------------------------------------------------------
# Uploads
# ---------------------------------------------------------------------------


def _upload_request(*files: dict) -> list[RenderJobUploadFile]:
    return [RenderJobUploadFile.model_validate(file) for file in files]


def test_uploads_are_signed_puts_with_each_files_type_size_and_name(db, cloud, owner, scene):
    _queue(db, owner, scene, spec=ANGLE_SET, kind="angle_set")
    job = _claim(db)
    name = "RING-1-front.jpg"

    [upload] = outputs.upload_targets(
        db, job.id, job.worker_token, _upload_request({"name": name, "content_type": "image/jpeg", "bytes": 1834212})
    )

    assert (upload.name, upload.key, upload.url) == (name, _key(job, name), f"https://r2.example.com/{_key(job, name)}?put")
    assert upload.headers == {
        "Content-Type": "image/jpeg",
        "Content-Length": "1834212",
        "Content-Disposition": f'attachment; filename="{name}"',
        "Cache-Control": "public, max-age=31536000, immutable",
    }
    assert cloud.signed_puts == [
        {"key": _key(job, name), "type": "image/jpeg", "expires": 900, "length": 1834212, "disposition": f'attachment; filename="{name}"'}
    ]


def test_on_local_storage_uploads_go_through_the_api(db, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)

    [upload] = outputs.upload_targets(
        db, job.id, job.worker_token, _upload_request({"name": "RING-1.png", "content_type": "image/png", "bytes": 64})
    )

    assert upload.url == f"/render-jobs/{job.id}/uploads/RING-1.png"
    assert upload.headers == {"Content-Type": "image/png", "Content-Length": "64"}


@pytest.mark.parametrize(
    ("files", "detail"),
    [
        ([{"name": "other.png", "content_type": "image/png", "bytes": 10}], "files[0].name: the job makes no 'other.png'"),
        ([{"name": "RING-1.png", "content_type": "image/jpeg", "bytes": 10}], "files[0].content_type: RING-1.png is image/png"),
        ([{"name": "RING-1.png", "content_type": "image/png", "bytes": 300 * 1024 * 1024}], "files[0].bytes: at most"),
        ([{"name": "RING-1.png", "content_type": "image/png", "bytes": 10}] * 2, "files: each name at most once"),
    ],
)
def test_uploads_are_only_the_files_the_spec_names(db, owner, scene, files, detail):
    _queue(db, owner, scene)
    job = _claim(db)

    error = _http_error(lambda: outputs.upload_targets(db, job.id, job.worker_token, _upload_request(*files)))

    assert (error.status_code, error.detail.startswith(detail)) == (400, True)


async def _chunks(*parts: bytes):
    for part in parts:
        yield part


def _put_local(db, job: RenderJob, name: str, content_type: str, *parts: bytes) -> None:
    asyncio.run(outputs.save_local_upload(db, job.id, job.worker_token, name, content_type, _chunks(*parts)))


def test_a_local_upload_stores_the_file_under_the_jobs_prefix(db, files, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)

    _put_local(db, job, "RING-1.png", "image/png", PNG[:5], PNG[5:])

    assert files.size(_key(job, "RING-1.png")) == len(PNG)


@pytest.mark.parametrize(
    ("name", "content_type", "body", "status"),
    [
        ("other.png", "image/png", PNG, 404),
        ("RING-1.png", "image/jpeg", PNG, 400),
        ("RING-1.png", "image/png", b"", 400),
        ("RING-1.png", "image/png", b"x" * 33, 413),
    ],
)
def test_a_local_upload_is_only_a_file_the_spec_names(db, files, owner, scene, monkeypatch, name, content_type, body, status):
    monkeypatch.setattr("app.features.render_jobs.job_files.MAX_IMAGE_BYTES", 32)
    _queue(db, owner, scene)
    job = _claim(db)

    assert _http_error(lambda: _put_local(db, job, name, content_type, body)).status_code == status
    assert files.size(_key(job, name)) is None


def test_a_local_upload_streams_to_staging_and_leaves_nothing_behind(db, files, owner, scene, monkeypatch):
    """The body is written as it arrives; a refused one leaves no staging file."""
    monkeypatch.setattr("app.features.render_jobs.specs.MAX_IMAGE_BYTES", 32)
    _queue(db, owner, scene)
    job = _claim(db)

    assert _http_error(lambda: _put_local(db, job, "RING-1.png", "image/png", b"x" * 20, b"x" * 20)).status_code == 413
    assert list(files.staging_dir().iterdir()) == []

    _put_local(db, job, "RING-1.png", "image/png", *[bytes([n]) * 8 for n in range(4)])
    assert files.get_bytes(_key(job, "RING-1.png")) == b"".join(bytes([n]) * 8 for n in range(4))
    assert list(files.staging_dir().iterdir()) == []


def test_on_cloud_storage_the_api_takes_no_uploads(db, cloud, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)

    assert _http_error(lambda: _put_local(db, job, "RING-1.png", "image/png", PNG)).status_code == 404


# ---------------------------------------------------------------------------
# Complete
# ---------------------------------------------------------------------------


def test_complete_makes_the_renders_charges_the_hold_and_counts_the_storage(db, clock, files, owner, scene):
    _queue(db, owner, scene, spec=ANGLE_SET, kind="angle_set")
    job = _claim(db)
    balance, used = _balance(db, owner), _storage_used(db, owner)
    names = job.spec["output_names"]
    for name in names:
        _upload(files, job, name)
    sha = "ab" * 32

    done = _complete(db, job, [_report(job, names[1], meta={"sha256": sha}), _report(job, names[0]), _report(job, names[2])])

    assert (done.status, done.credit_state, done.progress, done.finished_at) == ("completed", "charged", 1.0, T0)
    assert done.renderer == RENDERER
    assert _balance(db, owner) == balance  # the credits left the balance when they were held
    assert _storage_used(db, owner) == used + 3 * len(PNG)
    rows = db.query(Render).filter(Render.job_id == job.id).order_by(Render.id).all()
    assert [(row.filename, row.label, row.content_type, row.width, row.height, row.bytes, row.kind) for row in rows] == [
        ("RING-1-pose-hero.jpg", "pose-hero", "image/jpeg", 1024, 1024, len(PNG), "still"),
        ("RING-1-front.jpg", "front", "image/jpeg", 1024, 1024, len(PNG), "still"),
        ("RING-1-view-3.jpg", None, "image/jpeg", 1024, 1024, len(PNG), "still"),
    ]
    assert (rows[0].scene_id, rows[0].key, rows[0].meta, rows[1].meta) == (scene.id, _key(job, names[1]), {"sha256": sha}, None)
    assert (rows[0].material, rows[0].lighting) == ("platinum", "soft")
    assert [output.filename for output in service.job_view(db, job).outputs] == [row.filename for row in rows]


@pytest.mark.parametrize(
    "key",
    [
        "customers/{user}/renders/{other_job}/RING-1.png",
        "customers/999/renders/{job}/RING-1.png",
        "customers/{user}/models/RING-1.png",
        "customers/{user}/renders/{job}/../{other_job}/RING-1.png",
        "customers/{user}/renders/{job}/RING-1-copy.png",
    ],
)
def test_a_key_outside_the_jobs_prefix_is_400(db, files, owner, scene, key):
    other_job = _queue(db, owner, scene)
    job = _queue(db, owner, scene)
    owner_jobs = {"user": owner.id, "job": job.id, "other_job": other_job.id}
    other_job.priority, job.priority = 0, 200
    db.commit()
    claimed = _claim(db)
    assert claimed.id == job.id
    _upload(files, job, "RING-1.png")
    files.put_bytes(key.format(**owner_jobs).replace("/../", "/"), PNG)

    error = _http_error(lambda: _complete(db, job, [_report(job, "RING-1.png", key=key.format(**owner_jobs))]))

    assert error.status_code == 400
    assert error.detail.startswith("outputs[0].key:")
    assert _status(db, job) == ("running", "held")
    assert _storage_used(db, owner) == 0


def test_a_size_that_does_not_match_the_stored_file_is_400(db, files, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)

    missing = _http_error(lambda: _complete(db, job, [_report(job, "RING-1.png")]))
    _upload(files, job, "RING-1.png", PNG + b"more")
    wrong_size = _http_error(lambda: _complete(db, job, [_report(job, "RING-1.png")]))

    assert (missing.status_code, missing.detail) == (400, f"outputs[0].bytes: {len(PNG)} declared, nothing stored")
    assert (wrong_size.status_code, wrong_size.detail) == (
        400, f"outputs[0].bytes: {len(PNG)} declared, {len(PNG) + 4} bytes stored"
    )
    assert _status(db, job) == ("running", "held")


@pytest.mark.parametrize(
    ("change", "detail"),
    [
        ({"content_type": "image/jpeg"}, "outputs[0].content_type: RING-1.png is image/png"),
        ({"width": 1024}, "outputs[0]: the job renders 2048x1024"),
        ({"label": "front"}, "outputs[0].label: RING-1.png is labelled None"),
    ],
)
def test_complete_refuses_an_output_that_is_not_what_the_spec_makes(db, files, owner, scene, change, detail):
    _queue(db, owner, scene)
    job = _claim(db)
    _upload(files, job, "RING-1.png")

    error = _http_error(lambda: _complete(db, job, [_report(job, "RING-1.png", **change)]))

    assert (error.status_code, error.detail) == (400, detail)


def test_complete_needs_every_output_of_the_job_once(db, files, owner, scene):
    _queue(db, owner, scene, spec=ANGLE_SET, kind="angle_set")
    job = _claim(db)
    names = job.spec["output_names"]
    for name in names:
        _upload(files, job, name)

    missing = _http_error(lambda: _complete(db, job, [_report(job, name) for name in names[:2]]))
    twice = _http_error(lambda: _complete(db, job, [_report(job, name) for name in [*names[:2], names[0]]]))

    assert missing.status_code == twice.status_code == 400
    assert missing.detail == f"outputs: the job makes {', '.join(names)}, each once"
    assert _status(db, job) == ("running", "held")


def test_a_second_complete_is_409_and_charges_nothing(db, files, owner, scene):
    _queue(db, owner, scene)
    job = _claim(db)
    _complete_with_uploads(db, files, job)
    balance, used = _balance(db, owner), _storage_used(db, owner)

    error = _http_error(lambda: _complete(db, job, [_report(job, "RING-1.png")]))

    assert error.status_code == 409
    assert _status(db, job) == ("completed", "charged")
    assert (_balance(db, owner), _storage_used(db, owner)) == (balance, used)
    assert db.query(Render).filter(Render.job_id == job.id).count() == 1


def test_a_full_storage_ends_the_job_refunded_and_deletes_its_files(db, files, owner, scene):
    from app.features.billing.plans import get_quotas

    job = _queue(db, owner, scene)
    before = _balance(db, owner)
    billing = get_or_create_billing(db, owner)
    billing.storage_bytes_used = get_quotas("free").storage_bytes - len(PNG) + 1
    db.commit()
    _claim(db)
    _upload(files, job, "RING-1.png")

    error = _http_error(lambda: _complete(db, job, [_report(job, "RING-1.png")]))

    assert error.status_code == 402
    assert _status(db, job) == ("failed", "refunded")
    assert (job.error_code, _balance(db, owner)) == ("over_limit", before + 1)
    assert files.size(_key(job, "RING-1.png")) is None
    assert db.query(Render).filter(Render.job_id == job.id).count() == 0


def test_a_scene_deleted_before_complete_ends_the_job_refunded(db, files, owner, scene):
    job = _queue(db, owner, scene)
    _claim(db)
    _upload(files, job, "RING-1.png")
    job.scene_id = None
    db.commit()

    assert _http_error(lambda: _complete(db, job, [_report(job, "RING-1.png")])).status_code == 409
    assert _status(db, job) == ("failed", "refunded")
    assert files.size(_key(job, "RING-1.png")) is None


def test_storage_is_counted_against_the_plans_limit_in_one_statement(db, owner):
    from app.features.billing.plans import get_quotas

    limit = get_quotas("free").storage_bytes
    billing = get_or_create_billing(db, owner)
    billing.storage_bytes_used = limit - 10
    db.commit()

    count_storage_bytes(db, owner.id, 10)
    db.commit()
    assert _http_error(lambda: count_storage_bytes(db, owner.id, 1)).status_code == 402
    assert _storage_used(db, owner) == limit


# ---------------------------------------------------------------------------
# Turntables and spins
# ---------------------------------------------------------------------------

TURNTABLE = {"width": 1280, "height": 720, "fps": 30, "frames": 120, "path": {"orbit": {"start": {"pose": "pose-hero"}}}}
SPIN = {"frames": 36, "size": 1080, "format": "jpeg"}
# Each kind's one file: its name, type and size, and how long one attempt may run.
FRAME_KINDS = {
    "turntable": (TURNTABLE, "RING-1.mp4", "video/mp4", (1280, 720), 30 * 60),
    "spin": (SPIN, "RING-1-spin.zip", "application/zip", (1080, 1080), 15 * 60),
}


def test_a_turntables_payload_keeps_its_frames_and_its_run_time(db, owner, scene):
    _queue(db, owner, scene, spec=TURNTABLE, kind="turntable")
    job = _claim(db, kinds=["turntable"])

    payload = payloads.job_payload(db, job.id, job.worker_token).model_dump(mode="json")

    assert (payload["kind"], payload["spec"]) == ("turntable", {**TURNTABLE, "quality": "high", "output_names": ["RING-1.mp4"]})
    assert payload["limits"] == {"max_edge": 1280, "max_runtime_seconds": 1800}


def test_a_spins_payload_has_its_frames_and_its_size_as_the_longest_side(db, owner, scene):
    _queue(db, owner, scene, spec=SPIN, kind="spin")
    job = _claim(db, kinds=["spin"])

    payload = payloads.job_payload(db, job.id, job.worker_token).model_dump(mode="json")

    assert payload["spec"] == {**SPIN, "jpeg_quality": 0.95, "transparent": False, "output_names": ["RING-1-spin.zip"]}
    assert payload["limits"] == {"max_edge": 1080, "max_runtime_seconds": 900}


@pytest.mark.parametrize("kind", FRAME_KINDS)
def test_a_turntable_completes_with_its_mp4_and_a_spin_with_its_zip(db, files, owner, scene, kind):
    spec, name, content_type, (width, height), _ = FRAME_KINDS[kind]
    _queue(db, owner, scene, spec=spec, kind=kind)
    job = _claim(db, kinds=[kind])
    data = b"encoded" * 10

    [upload] = outputs.upload_targets(
        db, job.id, job.worker_token, _upload_request({"name": name, "content_type": content_type, "bytes": len(data)})
    )
    _upload(files, job, name, data)
    report = {"name": name, "key": upload.key, "content_type": content_type, "bytes": len(data), "width": width, "height": height}
    done = _complete(db, job, [report])

    assert (done.status, done.credit_state) == ("completed", "charged")
    [row] = db.query(Render).filter(Render.job_id == job.id).all()
    assert (row.kind, row.filename, row.content_type, row.width, row.height, row.label) == (
        kind, name, content_type, width, height, None,
    )


@pytest.mark.parametrize("kind", FRAME_KINDS)
def test_a_turntable_or_a_spin_uploads_only_its_one_file_within_its_cap(db, owner, scene, kind):
    from app.features.render_jobs.job_files import MAX_VIDEO_BYTES, MAX_ZIP_BYTES

    spec, name, content_type, _, _ = FRAME_KINDS[kind]
    cap = MAX_VIDEO_BYTES if kind == "turntable" else MAX_ZIP_BYTES
    _queue(db, owner, scene, spec=spec, kind=kind)
    job = _claim(db, kinds=[kind])

    def refused(**file) -> str:
        request = _upload_request({"name": name, "content_type": content_type, "bytes": 1, **file})
        return _http_error(lambda: outputs.upload_targets(db, job.id, job.worker_token, request)).detail

    outputs.upload_targets(db, job.id, job.worker_token, _upload_request({"name": name, "content_type": content_type, "bytes": cap}))
    assert refused(bytes=cap + 1) == f"files[0].bytes: at most {cap} bytes a file"
    assert refused(content_type="image/png") == f"files[0].content_type: {name} is {content_type}"
    assert refused(name="RING-1.png") == "files[0].name: the job makes no 'RING-1.png'"


@pytest.mark.parametrize("kind", FRAME_KINDS)
def test_a_turntable_runs_30_minutes_and_a_spin_15(db, clock, owner, scene, kind):
    spec, _, _, _, runtime = FRAME_KINDS[kind]
    _queue(db, owner, scene, spec=spec, kind=kind)
    job = _claim(db, kinds=[kind])

    clock.tick(runtime - 20)
    assert _heartbeat(db, job).cancel is False
    clock.tick(20)
    assert _heartbeat(db, job).cancel is True


def test_a_campaign_pack_runs_an_hour_and_completes_with_its_one_zip(db, clock, files):
    grower = _user(db, "grow@example.com", tier="grow")
    _queue(db, grower, _scene(db, grower), spec=DEFAULT_PACK, kind="campaign_pack")
    job = _claim(db, kinds=["campaign_pack"])
    name = f"RING-{grower.id}_campaign-pack.zip"

    payload = payloads.job_payload(db, job.id, job.worker_token).model_dump(mode="json")
    assert (payload["kind"], payload["spec"]["output_names"]) == ("campaign_pack", [name])
    # Its stills are its largest frames; a pack may run an hour.
    assert payload["limits"] == {"max_edge": 2000, "max_runtime_seconds": 3600}
    clock.tick(59 * 60)
    assert _heartbeat(db, job).cancel is False

    data = b"PK\x03\x04" + b"entries" * 10
    _upload(files, job, name, data)
    done = _complete(db, job, [{"name": name, "key": _key(job, name), "content_type": "application/zip", "bytes": len(data)}])

    assert (done.status, done.credits, done.credit_state) == ("completed", 49, "charged")
    [row] = db.query(Render).filter(Render.job_id == job.id).all()
    assert (row.kind, row.filename, row.content_type, row.width, row.height) == (
        "campaign_pack", name, "application/zip", None, None,
    )


# ---------------------------------------------------------------------------
# Fail
# ---------------------------------------------------------------------------


def test_a_retryable_failure_goes_back_to_the_queue_after_a_backoff(db, clock, owner, scene):
    job = _queue(db, owner, scene)
    before = _balance(db, owner)
    _claim(db)
    _heartbeat(db, job, progress=0.5, stage="rendering")

    failed = _fail(db, job, "gpu_lost")

    assert (failed.status, failed.error, failed.error_code, failed.credit_state) == ("queued", "gpu_lost!", "gpu_lost", "held")
    assert (failed.run_after, failed.progress, failed.stage) == (T0 + timedelta(seconds=30), 0.0, None)
    clock.tick(30)
    _claim(db)
    assert _fail(db, job, "upload_failed").run_after == clock.now + timedelta(seconds=60)
    assert _balance(db, owner) == before


@pytest.mark.parametrize(
    ("code", "retryable"),
    [("invalid_spec", False), ("model_unreadable", True), ("browser_crashed", False), ("over_limit", True)],
)
def test_a_final_failure_refunds(db, owner, scene, code, retryable):
    """A final code is never retried, whatever the worker says; a retryable one only when it may be."""
    job = _queue(db, owner, scene)
    before = _balance(db, owner)
    _claim(db)

    failed = _fail(db, job, code, retryable=retryable)

    assert (failed.status, failed.credit_state, failed.error_code, failed.finished_at) == ("failed", "refunded", code, T0)
    assert _balance(db, owner) == before + 1


def test_a_retryable_failure_on_the_last_attempt_is_final(db, clock, owner, scene):
    job = _queue(db, owner, scene)
    before = _balance(db, owner)
    for _ in range(3):
        _claim(db)
        _fail(db, job, "browser_crashed")
        clock.tick(300)

    assert _status(db, job) == ("failed", "refunded")
    assert (job.attempts, _balance(db, owner)) == (3, before + 1)


def test_a_failure_after_a_cancel_request_ends_canceled_and_refunded(db, owner, scene):
    job = _queue(db, owner, scene)
    before = _balance(db, owner)
    _claim(db)
    service.cancel_job(db, owner, job.id)

    failed = _fail(db, job, "unknown")

    assert (failed.status, failed.credit_state, failed.error_code) == ("canceled", "refunded", "canceled")
    assert _balance(db, owner) == before + 1


def test_a_failure_past_the_run_time_is_a_final_timeout(db, clock, owner, scene):
    job = _queue(db, owner, scene)
    _claim(db)
    clock.tick(worker.MAX_RUNTIME_SECONDS["still"])

    failed = _fail(db, job, "canceled")

    assert (failed.status, failed.credit_state, failed.error_code) == ("failed", "refunded", "timeout")


def test_a_final_failure_deletes_what_the_job_uploaded(db, files, owner, scene):
    job = _queue(db, owner, scene)
    _claim(db)
    _upload(files, job, "RING-1.png")

    _fail(db, job, "invalid_spec", retryable=False)

    assert files.size(_key(job, "RING-1.png")) is None


def test_fail_needs_the_running_job(db, owner, scene):
    job = _queue(db, owner, scene)

    assert _http_error(lambda: _fail(db, job)).status_code == 409
    _claim(db)
    assert _http_error(lambda: _fail(db, job, token="wrong")).status_code == 401


@pytest.mark.parametrize("call", ["heartbeat", "complete", "fail", "payload"])
def test_the_worker_calls_lock_the_job_row_on_postgres(call):
    """A claim can't issue a new token between their token check and their update."""
    statements = []

    class _Postgres:
        def get_bind(self):
            return SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

        def execute(self, stmt):
            statements.append(stmt)
            return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: None))

    db = _Postgres()
    calls = {
        "heartbeat": lambda: worker.heartbeat(db, 1, "t", progress=None, stage=None, settings=SETTINGS),
        "complete": lambda: outputs.complete_job(db, 1, "t", RenderJobCompleteRequest.model_validate({"outputs": [_report_stub()], "renderer": RENDERER})),
        "fail": lambda: worker.fail_job(db, 1, "t", error="boom", code="unknown", retryable=True),
        "payload": lambda: payloads.job_payload(db, 1, "t"),
    }

    assert _http_error(calls[call]).status_code == 404
    assert "FOR UPDATE" in str(statements[0].compile(dialect=postgresql.dialect()))


def _report_stub() -> dict:
    return {"name": "a.png", "key": "customers/1/renders/1/a.png", "content_type": "image/png", "bytes": 1}
