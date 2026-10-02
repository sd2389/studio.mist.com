"""TDD tests for render-job create/status service (Task 3)."""

from datetime import datetime

import pytest
from fastapi import HTTPException

from app.features.billing.quota_service import get_or_create_billing
from app.models.scene import Scene


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(db, email: str):
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


def _make_scene(db, user_id: int) -> Scene:
    """Create a minimal Scene row owned by user_id.

    There is no shared 'scene' fixture in conftest — we create one inline
    following the same pattern as other tests that need related objects
    (e.g. test_auth.py creates User rows inline rather than from conftest).
    """
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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def user(db):
    return _make_user(db, "creator@example.com")


@pytest.fixture()
def other_user(db):
    return _make_user(db, "other@example.com")


@pytest.fixture()
def scene(db, user):
    return _make_scene(db, user.id)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_create_job_requires_credit(db, user):
    """create_job raises 402 when render_credits_balance == 0."""
    from app.features.render_jobs.service import create_job
    from app.schemas.render_job import RenderJobCreate

    billing = get_or_create_billing(db, user)
    billing.render_credits_balance = 0
    db.commit()

    scene = _make_scene(db, user.id)

    body = RenderJobCreate(scene_id=scene.id, width=2048, height=2048)

    with pytest.raises(HTTPException) as exc_info:
        create_job(db, user, body)

    assert exc_info.value.status_code == 402


def test_create_job_enqueues_and_does_not_charge(db, user, scene):
    """create_job returns a queued job; render_credits_balance is unchanged."""
    from app.features.render_jobs.service import create_job
    from app.schemas.render_job import RenderJobCreate

    billing = get_or_create_billing(db, user)
    balance_before = billing.render_credits_balance
    assert balance_before > 0, "fixture must start with credits"

    # The free plan's max_image_resolution (4096) is allowed as asked
    body = RenderJobCreate(scene_id=scene.id, width=4096, height=2048)

    job = create_job(db, user, body)

    assert job.status == "queued"

    db.refresh(billing)
    assert billing.render_credits_balance == balance_before, "credit must NOT be consumed on create"

    assert (job.width, job.height) == (4096, 2048)

    # model_ref should match the scene's model_key
    assert job.model_ref == scene.model_key


@pytest.mark.parametrize(("width", "height"), [(8192, 8192), (4097, 1024), (1024, 4097)])
def test_create_job_refuses_resolution_over_plan_cap(db, user, scene, width, height):
    """Free caps either side at 4096: refused with 402, nothing queued."""
    from app.features.render_jobs.service import create_job
    from app.models.render_job import RenderJob
    from app.schemas.render_job import RenderJobCreate

    with pytest.raises(HTTPException) as exc_info:
        create_job(db, user, RenderJobCreate(scene_id=scene.id, width=width, height=height))

    assert exc_info.value.status_code == 402
    assert "Resolution limit exceeded for Free (max 4096 px per side)" in exc_info.value.detail
    assert db.query(RenderJob).count() == 0


def test_create_job_allows_8k_on_grow(db, user, scene):
    from app.features.render_jobs.service import create_job
    from app.schemas.render_job import RenderJobCreate

    billing = get_or_create_billing(db, user)
    billing.plan_tier = "grow"
    db.commit()

    job = create_job(db, user, RenderJobCreate(scene_id=scene.id, width=8192, height=4320))

    assert (job.width, job.height) == (8192, 4320)


def test_create_job_caps_active_jobs_at_10(db, user, scene):
    """11th create while 10 jobs are queued/running raises 429."""
    from app.features.render_jobs.service import create_job
    from app.schemas.render_job import RenderJobCreate

    body = RenderJobCreate(scene_id=scene.id, width=512, height=512)
    for _ in range(10):
        create_job(db, user, body)

    with pytest.raises(HTTPException) as exc_info:
        create_job(db, user, body)

    assert exc_info.value.status_code == 429
    assert "Too many active render jobs" in exc_info.value.detail


def test_status_owner_only(db, user, other_user, scene):
    """get_job_for_user raises 404 when the requesting user does not own the job."""
    from app.features.render_jobs.service import create_job, get_job_for_user
    from app.schemas.render_job import RenderJobCreate

    body = RenderJobCreate(scene_id=scene.id, width=512, height=512)
    job = create_job(db, user, body)

    with pytest.raises(HTTPException) as exc_info:
        get_job_for_user(db, other_user, job.id)

    assert exc_info.value.status_code == 404
