"""Render credits move in three steps: held when a job is created, charged when it completes,
refunded when it ends failed or canceled. Each balance change is one conditional UPDATE."""

from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.features.billing.quota_service import (
    get_or_create_billing,
    hold_render_credits,
    refund_render_job,
    set_subscription_period,
)
from app.features.render_jobs.service import cancel_job, create_job, create_jobs
from app.models import Base, RenderJob, Scene, User
from app.schemas.render_job import RenderJobCreate

FOUR_K = {"camera": {"pose": "pose-default"}, "width": 3840, "height": 2160}  # 2 credits


def _scene(db, user) -> Scene:
    scene = Scene(user_id=user.id, model_key="customers/1/models/ring.glb", created_at=datetime.utcnow())
    db.add(scene)
    db.commit()
    return scene


def _still(scene: Scene, **spec) -> RenderJobCreate:
    return RenderJobCreate(kind="still", scene_id=scene.id, spec={**FOUR_K, **spec})


def _balance(db, user) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.render_credits_balance


def _set_billing(db, user, **fields) -> None:
    billing = get_or_create_billing(db, user)
    for name, value in fields.items():
        setattr(billing, name, value)
    db.commit()


@pytest.fixture()
def scene(db, sample_user):
    return _scene(db, sample_user)


def test_creating_a_job_holds_its_credits_in_the_period_it_was_made(db, sample_user, scene):
    period = datetime(2026, 10, 1)
    _set_billing(db, sample_user, render_credits_balance=5, period_start=period)

    job, created = create_job(db, sample_user, _still(scene))

    assert created
    assert (job.credits, job.credit_state, job.billing_period_start) == (2, "held", period)
    assert _balance(db, sample_user) == 3


def test_a_job_the_balance_cant_cover_is_402_and_holds_nothing(db, sample_user, scene):
    _set_billing(db, sample_user, render_credits_balance=1)

    with pytest.raises(HTTPException) as exc:
        create_job(db, sample_user, _still(scene))

    assert exc.value.status_code == 402
    assert _balance(db, sample_user) == 1
    assert db.execute(select(RenderJob)).first() is None


def test_two_creates_at_once_cant_overspend(tmp_path):
    """Both requests read a balance that covers one job; only the first to hold gets it.

    Two sessions over one database stand for two API processes. The second request's billing
    row was read before the first committed, so a read-then-write would spend credits twice;
    the conditional UPDATE decides against the balance in the database.
    """
    engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    with Session() as setup:
        user = User(email="race@example.com", password_hash="hash", role="user", created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        setup.add(user)
        setup.commit()
        _set_billing(setup, user, render_credits_balance=3)
        scene = _scene(setup, user)
        user_id, scene_id = user.id, scene.id

    first, second = Session(), Session()
    try:
        users = [session.get(User, user_id) for session in (first, second)]
        stale = get_or_create_billing(second, users[1])
        assert stale.render_credits_balance == 3  # the second request has read the balance

        create_job(first, users[0], RenderJobCreate(kind="still", scene_id=scene_id, spec=FOUR_K))
        with pytest.raises(HTTPException) as exc:
            create_job(second, users[1], RenderJobCreate(kind="still", scene_id=scene_id, spec=FOUR_K))

        assert exc.value.status_code == 402
    finally:
        first.close()
        second.close()
    with Session() as check:
        assert _balance(check, check.get(User, user_id)) == 1
        assert len(check.execute(select(RenderJob)).all()) == 1
    engine.dispose()


def test_a_bulk_request_holds_the_sum_or_nothing(db, sample_user, scene):
    _set_billing(db, sample_user, plan_tier="grow", render_credits_balance=10)

    jobs = create_jobs(db, sample_user, [_still(scene), _still(scene, width=2048, height=2048)])

    assert [job.credits for job in jobs] == [2, 1]
    assert _balance(db, sample_user) == 7

    with pytest.raises(HTTPException) as exc:
        create_jobs(db, sample_user, [_still(scene)] * 4)  # 8 credits, 7 left
    assert exc.value.status_code == 402
    assert _balance(db, sample_user) == 7
    assert len(db.execute(select(RenderJob)).all()) == 2


def test_canceling_a_queued_job_refunds_it_once(db, sample_user, scene):
    before = _balance(db, sample_user)
    job, _ = create_job(db, sample_user, _still(scene))
    assert _balance(db, sample_user) == before - 2

    canceled = cancel_job(db, sample_user, job.id)

    assert (canceled.status, canceled.credit_state) == ("canceled", "refunded")
    assert canceled.finished_at is not None
    assert _balance(db, sample_user) == before
    with pytest.raises(HTTPException) as exc:
        cancel_job(db, sample_user, job.id)
    assert exc.value.status_code == 409
    assert _balance(db, sample_user) == before


def test_canceling_a_running_job_asks_its_worker_to_stop(db, sample_user, scene):
    """The credits stay held until the worker stops; the fail route then refunds them."""
    before = _balance(db, sample_user)
    job, _ = create_job(db, sample_user, _still(scene))
    job.status = "running"
    db.commit()

    asked = cancel_job(db, sample_user, job.id)
    again = cancel_job(db, sample_user, job.id)

    assert asked.status == "running"
    assert asked.cancel_requested_at is not None
    assert again.cancel_requested_at == asked.cancel_requested_at
    assert asked.credit_state == "held"
    assert _balance(db, sample_user) == before - 2


def test_a_refund_after_the_period_rolled_over_adds_nothing(db, sample_user, scene):
    """The new period's allotment replaced the balance the credits came out of."""
    _set_billing(db, sample_user, plan_tier="grow", period_start=datetime(2026, 9, 1), render_credits_balance=300)
    job, _ = create_job(db, sample_user, _still(scene))
    assert _balance(db, sample_user) == 298

    set_subscription_period(
        db,
        get_or_create_billing(db, sample_user),
        tier="grow",
        period_start=datetime(2026, 10, 1),
        period_end=datetime(2026, 11, 1),
        stripe_subscription_id="sub_123",
    )
    canceled = cancel_job(db, sample_user, job.id)

    assert (canceled.status, canceled.credit_state) == ("canceled", "refunded")
    assert _balance(db, sample_user) == 300


def test_a_refund_in_the_same_period_gives_the_credits_back(db, sample_user, scene):
    _set_billing(db, sample_user, plan_tier="grow", period_start=datetime(2026, 9, 1), render_credits_balance=300)
    job, _ = create_job(db, sample_user, _still(scene))

    cancel_job(db, sample_user, job.id)

    assert _balance(db, sample_user) == 300


def test_hold_and_refund_leave_the_commit_to_the_caller(db, sample_user):
    """So a hold and the jobs it pays for are committed together, or rolled back together."""
    _set_billing(db, sample_user, render_credits_balance=5)

    hold_render_credits(db, sample_user.id, 4)
    db.rollback()
    assert _balance(db, sample_user) == 5

    job = RenderJob(user_id=sample_user.id, credits=4, credit_state="held")
    db.add(job)
    db.commit()
    refund_render_job(db, job)
    db.rollback()
    db.refresh(job)
    assert job.credit_state == "held"
    assert _balance(db, sample_user) == 5
