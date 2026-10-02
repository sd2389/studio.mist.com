"""TDD tests for render-job worker endpoints (Task 4).

Tests cover:
- Worker auth dependency: 401 missing/wrong header; 503 when setting unset.
- POST /render-jobs/claim: oldest-first claim; sets status=running, attempts+=1;
  second sequential claim on empty queue → 204/None.
- Leases: each claim issues a new token and a lease; a running job whose lease
  ran out is claimed again as a failed attempt (failed for good after 3); the
  token of a claim that lost its lease is refused.
- GET /render-jobs/{id}/payload: 401 wrong token; model_url http passthrough;
  model_url presign path.
- POST /render-jobs/{id}/complete: 401 wrong token; bytes stored; result_key set;
  balance decremented exactly 1; idempotent (second call 409, no double charge).
- POST /render-jobs/{id}/fail: requeue (attempts 1→queued, error recorded);
  terminal (attempts >=3 → failed); balance unchanged in both.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _make_user(db: Session, email: str = "worker_test@example.com"):
    from app.features.billing.quota_service import get_or_create_billing
    from app.models.user import User

    user = User(
        email=email,
        password_hash="hash",
        role="user",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    get_or_create_billing(db, user)
    return user


def _make_scene(db: Session, user_id: int):
    from app.models.scene import Scene

    scene = Scene(
        user_id=user_id,
        model_key="models/test-ring.glb",
        material="original",
        lighting="studio",
        model_config={},
        slot_selections={},
        scene_settings={},
        variants={},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def _make_job(db: Session, user_id: int, model_ref: str = "models/test-ring.glb"):
    """Create a queued RenderJob directly (bypasses create_job service)."""
    from app.models.render_job import RenderJob

    job = RenderJob(
        user_id=user_id,
        scene_id=None,
        model_ref=model_ref,
        lighting="studio",
        preset="gold-18k-yellow",
        width=1024,
        height=1024,
        status="queued",
        attempts=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@pytest.fixture()
def user(db):
    return _make_user(db)


@pytest.fixture()
def job(db, user):
    return _make_job(db, user.id)


# ---------------------------------------------------------------------------
# Worker auth dependency tests
# ---------------------------------------------------------------------------


class TestWorkerAuthDependency:
    """Test the require_worker_token dependency."""

    def test_503_when_setting_unset(self, monkeypatch):
        """503 when RENDER_WORKER_TOKEN is not configured."""
        from app.features.render_jobs import service as svc

        with monkeypatch.context() as m:
            import app.config as cfg

            fake_settings = MagicMock()
            fake_settings.render_worker_token = None
            m.setattr(cfg, "get_settings", lambda: fake_settings)

            with pytest.raises(HTTPException) as exc:
                svc.require_worker_token(
                    x_worker_token="any-token",
                    settings=fake_settings,
                )
            assert exc.value.status_code == 503

    def test_401_when_token_missing(self, monkeypatch):
        """401 when X-Worker-Token header is absent (None)."""
        from app.features.render_jobs import service as svc

        fake_settings = MagicMock()
        fake_settings.render_worker_token = "secret-abc"

        with pytest.raises(HTTPException) as exc:
            svc.require_worker_token(
                x_worker_token=None,
                settings=fake_settings,
            )
        assert exc.value.status_code == 401

    def test_401_when_token_wrong(self, monkeypatch):
        """401 when X-Worker-Token does not match settings."""
        from app.features.render_jobs import service as svc

        fake_settings = MagicMock()
        fake_settings.render_worker_token = "secret-abc"

        with pytest.raises(HTTPException) as exc:
            svc.require_worker_token(
                x_worker_token="wrong-token",
                settings=fake_settings,
            )
        assert exc.value.status_code == 401

    def test_passes_when_token_correct(self):
        """No exception when token matches setting."""
        from app.features.render_jobs import service as svc

        fake_settings = MagicMock()
        fake_settings.render_worker_token = "secret-abc"

        # Should not raise
        svc.require_worker_token(
            x_worker_token="secret-abc",
            settings=fake_settings,
        )


# ---------------------------------------------------------------------------
# Claim tests
# ---------------------------------------------------------------------------


class TestClaimJob:
    """Test claim_job service function."""

    def test_claim_sets_running_and_increments_attempts(self, db, user):
        """Claiming oldest queued job sets status=running, attempts=1."""
        from app.features.render_jobs.service import claim_job

        job = _make_job(db, user.id)
        result = claim_job(db)

        assert result is not None
        assert result.id == job.id
        assert result.status == "running"
        assert result.attempts == 1

    def test_claim_returns_oldest_first(self, db, user):
        """When multiple queued jobs exist, claim returns the oldest (by created_at)."""
        from app.features.render_jobs.service import claim_job

        # Create two jobs; first one should be claimed first
        job_first = _make_job(db, user.id, model_ref="models/ring-first.glb")
        job_second = _make_job(db, user.id, model_ref="models/ring-second.glb")

        claimed = claim_job(db)

        assert claimed is not None
        assert claimed.id == job_first.id

    def test_claim_returns_none_on_empty_queue(self, db, user):
        """When queue is empty, claim_job returns None (→ 204 in router)."""
        from app.features.render_jobs.service import claim_job

        result = claim_job(db)
        assert result is None

    def test_two_sequential_claims_drain_single_job(self, db, user):
        """Second sequential claim when queue is empty returns None."""
        from app.features.render_jobs.service import claim_job

        _make_job(db, user.id)

        first = claim_job(db)
        assert first is not None
        assert first.status == "running"

        second = claim_job(db)
        assert second is None


# ---------------------------------------------------------------------------
# Lease tests
# ---------------------------------------------------------------------------


def _expire_lease(db: Session, job) -> None:
    """Make a claimed job look abandoned: its lease ran out a second ago."""
    job.lease_expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()


class TestClaimLease:
    """A claim leases the job; a lapsed lease hands it to the next claim."""

    def test_claim_leases_the_job_for_the_configured_time(self, db, user):
        """lease_expires_at is claim time + RENDER_JOB_LEASE_SECONDS."""
        from app.features.render_jobs.service import claim_job

        _make_job(db, user.id)
        before = datetime.utcnow()
        job = claim_job(db, SimpleNamespace(render_job_lease_seconds=900))

        assert before + timedelta(seconds=900) <= job.lease_expires_at
        assert job.lease_expires_at <= datetime.utcnow() + timedelta(seconds=900)

    def test_claim_issues_a_new_token(self, db, user):
        """The token a job was created with stops working once it is claimed."""
        from app.features.render_jobs.service import claim_job

        job = _make_job(db, user.id)
        created_token = job.worker_token

        claimed = claim_job(db)

        assert claimed.worker_token != created_token

    def test_running_job_with_live_lease_is_not_claimed(self, db, user):
        """A job whose worker still holds the lease stays with that worker."""
        from app.features.render_jobs.service import claim_job

        _make_job(db, user.id)
        claim_job(db)

        assert claim_job(db) is None

    def test_lapsed_lease_is_claimed_again_as_a_failed_attempt(self, db, user):
        """The abandoned attempt counts; the job runs again with a new token and lease."""
        from app.features.render_jobs.service import LEASE_EXPIRED_ERROR, claim_job

        _make_job(db, user.id)
        first = claim_job(db)
        first_token = first.worker_token
        _expire_lease(db, first)

        second = claim_job(db)

        assert second.id == first.id
        assert second.status == "running"
        assert second.attempts == 2
        assert second.error == LEASE_EXPIRED_ERROR
        assert second.worker_token != first_token
        assert second.lease_expires_at > datetime.utcnow()

    def test_lapsed_leases_keep_the_three_attempt_limit(self, db, user):
        """A job whose worker keeps vanishing is claimed 3 times, then fails for good."""
        from app.features.render_jobs.service import LEASE_EXPIRED_ERROR, claim_job

        job = _make_job(db, user.id)
        for attempt in (1, 2, 3):
            claimed = claim_job(db)
            assert claimed.id == job.id
            assert claimed.attempts == attempt
            _expire_lease(db, claimed)

        assert claim_job(db) is None
        db.refresh(job)
        assert job.status == "failed"
        assert job.attempts == 3
        assert job.error == LEASE_EXPIRED_ERROR

    def test_exhausted_job_does_not_block_the_queue(self, db, user):
        """Failing an exhausted job and claiming the next one happen in the same claim."""
        from app.features.render_jobs.service import claim_job

        stuck = _make_job(db, user.id)
        stuck.status = "running"
        stuck.attempts = 3
        db.commit()
        _expire_lease(db, stuck)
        waiting = _make_job(db, user.id)

        claimed = claim_job(db)

        assert claimed.id == waiting.id
        db.refresh(stuck)
        assert stuck.status == "failed"

    def test_worker_that_lost_the_lease_is_refused(self, db, user):
        """After a re-claim, the old token can neither fetch, complete nor fail the job."""
        from app.features.render_jobs.service import claim_job, complete_job, fail_job, get_job_payload

        _make_job(db, user.id)
        first = claim_job(db)
        stale_token = first.worker_token
        _expire_lease(db, first)
        claim_job(db)

        for call in (
            lambda: get_job_payload(db, first.id, token=stale_token),
            lambda: complete_job(db, first.id, token=stale_token, data=b"PNG"),
            lambda: fail_job(db, first.id, token=stale_token, error="late"),
        ):
            with pytest.raises(HTTPException) as exc:
                call()
            assert exc.value.status_code == 401

        db.refresh(first)
        assert first.status == "running"
        assert first.attempts == 2

    def test_late_worker_can_still_finish_when_nobody_reclaimed(self, db, user):
        """A lapsed lease alone refuses nothing: the job completes if no claim took it back."""
        from app.features.render_jobs.service import claim_job, complete_job

        _make_job(db, user.id)
        job = claim_job(db)
        _expire_lease(db, job)

        with patch("app.features.render_jobs.service.write_bytes"):
            with patch("app.features.render_jobs.service.render_key", return_value="customers/1/renders/abc.png"):
                done = complete_job(db, job.id, token=job.worker_token, data=b"PNG-BYTES")

        assert done.status == "completed"


# ---------------------------------------------------------------------------
# Payload tests
# ---------------------------------------------------------------------------


class TestGetJobPayload:
    """Test get_job_payload service function."""

    def test_401_on_wrong_token(self, db, user, job):
        """get_job_payload raises 401 when token != job.worker_token."""
        from app.features.render_jobs.service import get_job_payload

        with pytest.raises(HTTPException) as exc:
            get_job_payload(db, job.id, token="wrong-token")
        assert exc.value.status_code == 401

    def test_http_model_ref_returned_as_is(self, db, user):
        """When model_ref starts with http, model_url is returned as-is (no presign)."""
        from app.features.render_jobs.service import get_job_payload

        http_job = _make_job(db, user.id, model_ref="https://example.com/ring.glb")

        with patch("app.features.render_jobs.service.presign_get") as mock_presign:
            payload = get_job_payload(db, http_job.id, token=http_job.worker_token)

        mock_presign.assert_not_called()
        assert payload.model_url == "https://example.com/ring.glb"

    def test_storage_model_ref_presigned(self, db, user):
        """When model_ref is a storage key (no http), model_url is presigned URL."""
        from app.features.render_jobs.service import get_job_payload

        storage_job = _make_job(db, user.id, model_ref="customers/1/models/ring.glb")
        presigned_url = "https://storage.example.com/customers/1/models/ring.glb?sig=abc"

        with patch(
            "app.features.render_jobs.service.presign_get",
            return_value=presigned_url,
        ) as mock_presign:
            payload = get_job_payload(db, storage_job.id, token=storage_job.worker_token)

        mock_presign.assert_called_once_with("customers/1/models/ring.glb")
        assert payload.model_url == presigned_url

    def test_payload_contains_all_fields(self, db, user):
        """Payload includes lighting, preset, width, height."""
        from app.features.render_jobs.service import get_job_payload

        http_job = _make_job(db, user.id, model_ref="https://cdn.example.com/ring.glb")

        with patch("app.features.render_jobs.service.presign_get"):
            payload = get_job_payload(db, http_job.id, token=http_job.worker_token)

        assert payload.lighting == "studio"
        assert payload.preset == "gold-18k-yellow"
        assert payload.width == 1024
        assert payload.height == 1024


# ---------------------------------------------------------------------------
# Complete tests
# ---------------------------------------------------------------------------


class TestCompleteJob:
    """Test complete_job service function."""

    def test_401_on_wrong_token(self, db, user):
        """complete_job raises 401 when token != job.worker_token."""
        from app.features.render_jobs.service import complete_job

        job = _make_job(db, user.id)
        # Manually set status to running
        job.status = "running"
        job.attempts = 1
        db.commit()

        with pytest.raises(HTTPException) as exc:
            complete_job(db, job.id, token="wrong-token", data=b"fake-png")
        assert exc.value.status_code == 401

    def test_409_when_not_running(self, db, user):
        """complete_job raises 409 when job.status != 'running'."""
        from app.features.render_jobs.service import complete_job

        job = _make_job(db, user.id)
        # Status is 'queued' by default — not running

        with pytest.raises(HTTPException) as exc:
            complete_job(db, job.id, token=job.worker_token, data=b"fake-png")
        assert exc.value.status_code == 409

    def test_happy_path_stores_bytes_sets_result_key_consumes_credit(self, db, user):
        """complete_job writes bytes, sets result_key, decrements render credit by 1."""
        from app.features.billing.quota_service import get_or_create_billing
        from app.features.render_jobs.service import complete_job

        job = _make_job(db, user.id)
        job.status = "running"
        job.attempts = 1
        db.commit()

        billing = get_or_create_billing(db, user)
        balance_before = billing.render_credits_balance

        stored_calls = []

        def fake_write_bytes(key: str, data: bytes, content_type: str | None = None):
            stored_calls.append({"key": key, "data": data, "content_type": content_type})

        with patch("app.features.render_jobs.service.write_bytes", side_effect=fake_write_bytes):
            with patch("app.features.render_jobs.service.render_key", return_value="customers/1/renders/abc.png"):
                complete_job(db, job.id, token=job.worker_token, data=b"PNG-BYTES")

        # Bytes stored with correct content type
        assert len(stored_calls) == 1
        assert stored_calls[0]["data"] == b"PNG-BYTES"
        assert stored_calls[0]["content_type"] == "image/png"

        # result_key set on job
        db.refresh(job)
        assert job.result_key is not None
        assert job.status == "completed"

        # Credit decremented by exactly 1
        db.refresh(billing)
        assert billing.render_credits_balance == balance_before - 1

    def test_zero_balance_at_completion_fails_job_402_no_write(self, db, user):
        """Zero balance at completion → 402, job failed, no bytes written.

        Prevents the orphan-PNG loop: without the precheck the PNG uploads,
        the charge fails, and the worker retries a render nobody can pay for.
        """
        from app.features.billing.quota_service import get_or_create_billing
        from app.features.render_jobs.service import complete_job

        job = _make_job(db, user.id)
        job.status = "running"
        job.attempts = 1
        billing = get_or_create_billing(db, user)
        billing.render_credits_balance = 0
        db.commit()

        with patch("app.features.render_jobs.service.write_bytes") as mock_write:
            with pytest.raises(HTTPException) as exc:
                complete_job(db, job.id, token=job.worker_token, data=b"PNG-BYTES")

        assert exc.value.status_code == 402
        mock_write.assert_not_called()

        db.refresh(job)
        assert job.status == "failed"
        assert job.error == "no credits at completion"

    def test_second_complete_call_is_409_no_double_charge(self, db, user):
        """Second complete call returns 409 and does NOT decrement credit again."""
        from app.features.billing.quota_service import get_or_create_billing
        from app.features.render_jobs.service import complete_job

        job = _make_job(db, user.id)
        job.status = "running"
        job.attempts = 1
        db.commit()

        billing = get_or_create_billing(db, user)

        with patch("app.features.render_jobs.service.write_bytes"):
            with patch("app.features.render_jobs.service.render_key", return_value="customers/1/renders/abc.png"):
                # First call — should succeed
                complete_job(db, job.id, token=job.worker_token, data=b"PNG-BYTES")

        balance_after_first = billing.render_credits_balance
        db.refresh(billing)
        balance_after_first = billing.render_credits_balance

        # Second call — should 409
        with pytest.raises(HTTPException) as exc:
            with patch("app.features.render_jobs.service.write_bytes"):
                with patch("app.features.render_jobs.service.render_key", return_value="customers/1/renders/abc.png"):
                    complete_job(db, job.id, token=job.worker_token, data=b"PNG-BYTES-2")
        assert exc.value.status_code == 409

        # Balance must not have changed
        db.refresh(billing)
        assert billing.render_credits_balance == balance_after_first


# ---------------------------------------------------------------------------
# Fail tests
# ---------------------------------------------------------------------------


class TestFailJob:
    """Test fail_job service function."""

    def test_401_on_wrong_token(self, db, user):
        """fail_job raises 401 when token != job.worker_token."""
        from app.features.render_jobs.service import fail_job

        job = _make_job(db, user.id)
        job.status = "running"
        job.attempts = 1
        db.commit()

        with pytest.raises(HTTPException) as exc:
            fail_job(db, job.id, token="wrong-token", error="crash")
        assert exc.value.status_code == 401

    def test_409_when_not_running(self, db, user):
        """fail_job raises 409 when job.status != 'running'."""
        from app.features.render_jobs.service import fail_job

        job = _make_job(db, user.id)
        # Status is 'queued' by default

        with pytest.raises(HTTPException) as exc:
            fail_job(db, job.id, token=job.worker_token, error="crash")
        assert exc.value.status_code == 409

    def test_fail_at_attempts_1_requeues(self, db, user):
        """fail_job with attempts=1 (< 3) requeues: status=queued, error recorded."""
        from app.features.billing.quota_service import get_or_create_billing
        from app.features.render_jobs.service import fail_job

        job = _make_job(db, user.id)
        job.status = "running"
        job.attempts = 1
        db.commit()

        billing = get_or_create_billing(db, user)
        balance_before = billing.render_credits_balance

        fail_job(db, job.id, token=job.worker_token, error="GPU OOM")

        db.refresh(job)
        assert job.status == "queued"
        assert job.error == "GPU OOM"

        # No credit consumed
        db.refresh(billing)
        assert billing.render_credits_balance == balance_before

    def test_fail_at_attempts_2_still_requeues(self, db, user):
        """fail_job with attempts=2 (< 3) still requeues."""
        from app.features.render_jobs.service import fail_job

        job = _make_job(db, user.id)
        job.status = "running"
        job.attempts = 2
        db.commit()

        fail_job(db, job.id, token=job.worker_token, error="Timeout")

        db.refresh(job)
        assert job.status == "queued"

    def test_fail_at_attempts_3_marks_failed(self, db, user):
        """fail_job with attempts=3 (>= 3) sets status=failed."""
        from app.features.billing.quota_service import get_or_create_billing
        from app.features.render_jobs.service import fail_job

        job = _make_job(db, user.id)
        job.status = "running"
        job.attempts = 3
        db.commit()

        billing = get_or_create_billing(db, user)
        balance_before = billing.render_credits_balance

        fail_job(db, job.id, token=job.worker_token, error="Fatal error after 3 attempts")

        db.refresh(job)
        assert job.status == "failed"
        assert job.error == "Fatal error after 3 attempts"

        # No credit consumed on failure
        db.refresh(billing)
        assert billing.render_credits_balance == balance_before
