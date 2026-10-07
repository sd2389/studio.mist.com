"""Plan credits and bought credits (app/features/billing/credit_pools.py): spending takes the plan's
credits first; a reset or plan change replaces only those; a refund gives back what its hold took
from each pool; and every one of them is a single UPDATE that two requests at once can't both win."""

from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.features.billing.credit_pools import bought_credits, split_bought, taken_from_bought
from app.features.billing.plans import get_quotas
from app.features.billing.purchases import record_topup_purchase
from app.features.billing.quota_service import (
    adjust_credits,
    consume_ai_image_credit,
    consume_model_credit,
    downgrade_to_free,
    get_or_create_billing,
    hold_render_credits,
    refund_render_job,
    reset_allotments,
    set_subscription_period,
    snapshot,
)
from app.features.render_jobs.service import cancel_job, create_job, create_jobs
from app.models import Base, RenderJob, Scene, User
from app.schemas.render_job import RenderJobBulkCreate, RenderJobCreate

STILL = {"camera": {"pose": "pose-default"}, "width": 3840, "height": 2160}  # 2 render credits
SEPTEMBER, OCTOBER, NOVEMBER = datetime(2026, 9, 1), datetime(2026, 10, 1), datetime(2026, 11, 1)
GROW = get_quotas("grow")


def _set_billing(db, user, **fields) -> None:
    billing = get_or_create_billing(db, user)
    for name, value in fields.items():
        setattr(billing, name, value)
    db.commit()


def _buy(db, user, kind: str, credits: int, session_id: str) -> None:
    """A paid top-up, as the Stripe webhook records it."""
    assert record_topup_purchase(
        db,
        get_or_create_billing(db, user),
        kind=kind,
        credits=credits,
        session_id=session_id,
        event_id=f"evt_{session_id}",
        amount_total=None,
        currency=None,
    )


def _pools(db, user, kind: str) -> tuple[int, int]:
    """(balance, bought credits in it) of one kind, read afresh."""
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    balance = {
        "model": billing.model_credits_balance,
        "ai": billing.ai_image_credits_balance,
        "render": billing.render_credits_balance,
    }[kind]
    return balance, bought_credits(billing, kind)


def _scene(db, user) -> Scene:
    scene = Scene(user_id=user.id, model_key=f"customers/{user.id}/models/ring.glb", created_at=datetime.utcnow())
    db.add(scene)
    db.commit()
    return scene


def _still(scene: Scene) -> RenderJobCreate:
    return RenderJobCreate(kind="still", scene_id=scene.id, spec=STILL)


# ---------------------------------------------------------------------------
# The arithmetic
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("bought", "balance_after", "spent", "taken"),
    [
        (10, 15, 20, 0),  # 35 = 25 plan + 10 bought: 20 plan credits cover it
        (10, 7, 8, 3),  # 15 = 5 plan + 10 bought: 5 plan, then 3 bought
        (10, 0, 4, 4),  # all bought
        (40, 7, 8, 8),  # bought_* above the balance: everything left was bought
        (0, 3, 5, 0),  # nothing bought
    ],
)
def test_what_a_spend_took_from_bought_credits_comes_from_the_row_it_left(bought, balance_after, spent, taken):
    assert taken_from_bought(bought, balance_after, spent) == taken


def test_credits_held_together_give_the_plan_credits_to_the_first_ones():
    assert split_bought([4, 6], 3) == [0, 3]
    assert split_bought([2, 2, 2], 3) == [0, 1, 2]
    assert split_bought([1, 1, 1], 0) == [0, 0, 0]
    assert split_bought([1, 1, 1], 3) == [1, 1, 1]


# ---------------------------------------------------------------------------
# Spending: plan credits first
# ---------------------------------------------------------------------------


def test_a_hold_takes_plan_credits_before_bought_ones(db, sample_user):
    _buy(db, sample_user, "render", 10, "cs_render")  # Free's 25 render credits and 10 bought
    assert _pools(db, sample_user, "render") == (35, 10)

    first = hold_render_credits(db, sample_user.id, 20)
    db.commit()
    second = hold_render_credits(db, sample_user.id, 8)
    db.commit()

    assert (first.bought_render_credits, second.bought_render_credits) == (0, 3)
    assert _pools(db, sample_user, "render") == (7, 7)


def test_uploads_and_ai_images_spend_plan_credits_before_bought_ones(db, sample_user):
    _buy(db, sample_user, "model", 10, "cs_models")  # Free's 3 and 10 bought
    _buy(db, sample_user, "ai", 50, "cs_ai")  # Free's 25 and 50 bought
    billing = get_or_create_billing(db, sample_user)

    for _ in range(3):
        consume_model_credit(db, billing)
        db.commit()
    assert _pools(db, sample_user, "model") == (10, 10)
    consume_model_credit(db, billing)
    db.commit()
    assert _pools(db, sample_user, "model") == (9, 9)

    for _ in range(26):
        consume_ai_image_credit(db, billing)
    assert _pools(db, sample_user, "ai") == (49, 49)


def test_the_snapshot_shows_the_totals_and_how_many_are_bought(db, sample_user):
    _buy(db, sample_user, "ai", 50, "cs_ai")

    account = snapshot(db, sample_user)

    assert account.balances.ai_image_credits == 75
    assert account.bought_balances.model_dump() == {"model_credits": 0, "ai_image_credits": 50, "render_credits": 0}


def _two_sessions(tmp_path):
    """Two sessions over one database, standing for two API processes, and the user's id."""
    engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    with Session() as setup:
        user = User(email="race@example.com", password_hash="h", role="user", created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        setup.add(user)
        setup.commit()
        get_or_create_billing(setup, user)
        user_id = user.id
    return engine, Session, user_id


def test_two_holds_at_once_cant_both_take_the_last_credits(tmp_path):
    """Both requests read a balance that covers them; only the first to hold gets it, and what it
    took from each pool is what the database had, not what either request read."""
    engine, Session, user_id = _two_sessions(tmp_path)
    with Session() as setup:
        _set_billing(setup, setup.get(User, user_id), render_credits_balance=1)
        _buy(setup, setup.get(User, user_id), "render", 2, "cs_last")  # 1 plan, 2 bought

    first, second = Session(), Session()
    try:
        stale = get_or_create_billing(second, second.get(User, user_id))
        assert stale.render_credits_balance == 3  # read before the first holds
        hold = hold_render_credits(first, user_id, 3)
        first.commit()
        with pytest.raises(HTTPException) as exc:
            hold_render_credits(second, user_id, 3)
        assert exc.value.status_code == 402
    finally:
        first.close()
        second.close()
    assert hold.bought_render_credits == 2
    with Session() as check:
        assert _pools(check, check.get(User, user_id), "render") == (0, 0)
    engine.dispose()


def test_two_ai_images_at_once_cant_both_spend_the_last_credit(tmp_path):
    """The balance in memory says 1 in both; the conditional UPDATE lets only one spend it."""
    engine, Session, user_id = _two_sessions(tmp_path)
    with Session() as setup:
        _set_billing(setup, setup.get(User, user_id), ai_image_credits_balance=1)

    first, second = Session(), Session()
    try:
        billings = [get_or_create_billing(session, session.get(User, user_id)) for session in (first, second)]
        consume_ai_image_credit(first, billings[0])
        with pytest.raises(HTTPException) as exc:
            consume_ai_image_credit(second, billings[1])
        assert exc.value.status_code == 402
    finally:
        first.close()
        second.close()
    with Session() as check:
        assert _pools(check, check.get(User, user_id), "ai") == (0, 0)
    engine.dispose()


# ---------------------------------------------------------------------------
# Resets keep bought credits
# ---------------------------------------------------------------------------


def _renew(db, user, tier: str = "grow", start: datetime = OCTOBER, end: datetime = NOVEMBER) -> bool:
    return set_subscription_period(
        db, get_or_create_billing(db, user), tier=tier, period_start=start, period_end=end, stripe_subscription_id="sub_1"
    )


# Each reset path: the plan the account starts the test on, and the reset.
RESETS = {
    "renewal": ("grow", lambda db, user: _renew(db, user, start=OCTOBER)),
    "upgrade": ("grow", lambda db, user: _renew(db, user, tier="studio", start=SEPTEMBER)),
    "downgrade": ("studio", lambda db, user: _renew(db, user, tier="grow", start=SEPTEMBER)),
    "cancellation": ("grow", lambda db, user: downgrade_to_free(db, get_or_create_billing(db, user))),
    "admin reset": ("grow", lambda db, user: reset_allotments(db, get_or_create_billing(db, user), "grow")),
    "Free monthly reset": ("free", lambda db, user: reset_allotments(db, get_or_create_billing(db, user), "free")),
}


@pytest.mark.parametrize("reset", RESETS)
def test_a_reset_replaces_plan_credits_and_keeps_bought_ones(db, sample_user, reset):
    """Mid-period: 10 bought model credits, 4 of them spent once the plan's ran out, and 50 bought
    AI credits untouched. Every reset leaves what is left of them and replaces the rest."""
    start_tier, apply_reset = RESETS[reset]
    if start_tier != "free":
        _renew(db, sample_user, tier=start_tier, start=SEPTEMBER)
    _buy(db, sample_user, "model", 10, "cs_models")
    _buy(db, sample_user, "ai", 50, "cs_ai")
    billing = get_or_create_billing(db, sample_user)
    for _ in range(get_quotas(start_tier).model_credits + 4):
        consume_model_credit(db, billing)
        db.commit()
    assert _pools(db, sample_user, "model") == (6, 6)

    apply_reset(db, sample_user)

    db.refresh(billing)
    quotas = get_quotas(billing.plan_tier)
    assert _pools(db, sample_user, "model") == (quotas.model_credits + 6, 6)
    assert _pools(db, sample_user, "ai") == (quotas.ai_image_credits + 50, 50)
    assert _pools(db, sample_user, "render") == (quotas.render_credits, 0)
    assert billing.custom_asset_credits_balance == quotas.custom_asset_credits


def test_a_free_reset_resets_every_month(db, sample_user):
    """Free's reset isn't held to once a period: each call gives the allowance again."""
    _buy(db, sample_user, "ai", 50, "cs_ai")
    billing = get_or_create_billing(db, sample_user)
    for month in range(2):
        for _ in range(30):
            consume_ai_image_credit(db, billing)
        reset_allotments(db, billing, "free")
        assert _pools(db, sample_user, "ai") == (25 + 45, 45), month
        _buy(db, sample_user, "ai", 5, f"cs_more_{month}")


# ---------------------------------------------------------------------------
# Refunds give back what the hold took from each pool
# ---------------------------------------------------------------------------


def test_a_canceled_jobs_bought_credits_come_back_as_bought(db, sample_user):
    """The job took 1 plan credit and 1 bought one; after its refund the next reset keeps all 10
    bought credits, where a refund as plan credits would have let it delete one."""
    scene = _scene(db, sample_user)
    _set_billing(db, sample_user, render_credits_balance=1, period_start=SEPTEMBER)
    _buy(db, sample_user, "render", 10, "cs_render")

    job, _ = create_job(db, sample_user, _still(scene))
    assert (job.credits, job.bought_credits) == (2, 1)
    assert _pools(db, sample_user, "render") == (9, 9)

    cancel_job(db, sample_user, job.id)
    assert _pools(db, sample_user, "render") == (11, 10)
    reset_allotments(db, get_or_create_billing(db, sample_user), "free")
    assert _pools(db, sample_user, "render") == (25 + 10, 10)


def test_a_refund_after_the_period_rolled_over_gives_back_only_the_bought_credits(db, sample_user):
    """The new period's allowance replaced the plan credits the job took; its bought ones are still
    the customer's."""
    scene = _scene(db, sample_user)
    _set_billing(db, sample_user, plan_tier="grow", render_credits_balance=1, period_start=SEPTEMBER)
    _buy(db, sample_user, "render", 10, "cs_render")
    job, _ = create_job(db, sample_user, _still(scene))

    _renew(db, sample_user, start=OCTOBER)
    assert _pools(db, sample_user, "render") == (GROW.render_credits + 9, 9)
    cancel_job(db, sample_user, job.id)

    assert _pools(db, sample_user, "render") == (GROW.render_credits + 10, 10)


def test_a_bulk_hold_shares_its_bought_credits_among_its_jobs(db, sample_user):
    scene = _scene(db, sample_user)
    _set_billing(db, sample_user, plan_tier="grow", render_credits_balance=3)
    _buy(db, sample_user, "render", 10, "cs_render")

    jobs, _ = create_jobs(db, sample_user, RenderJobBulkCreate(jobs=[_still(scene)] * 3))

    assert [(job.credits, job.bought_credits) for job in jobs] == [(2, 0), (2, 1), (2, 2)]
    assert _pools(db, sample_user, "render") == (7, 7)
    cancel_job(db, sample_user, jobs[2].id)
    assert _pools(db, sample_user, "render") == (9, 9)
    cancel_job(db, sample_user, jobs[0].id)
    assert _pools(db, sample_user, "render") == (11, 9)


def test_a_refund_returns_its_credits_once(db, sample_user):
    scene = _scene(db, sample_user)
    _set_billing(db, sample_user, render_credits_balance=0)
    _buy(db, sample_user, "render", 4, "cs_render")
    job, _ = create_job(db, sample_user, _still(scene))

    cancel_job(db, sample_user, job.id)
    refund_render_job(db, db.get(RenderJob, job.id))
    db.commit()

    assert _pools(db, sample_user, "render") == (4, 4)
    assert db.execute(select(RenderJob.credit_state)).scalar_one() == "refunded"


# ---------------------------------------------------------------------------
# Admin adjustments
# ---------------------------------------------------------------------------


def test_an_admin_grant_adds_plan_credits_and_a_deduction_takes_plan_ones_first(db, sample_user, admin_user):
    _buy(db, sample_user, "ai", 50, "cs_ai")  # 25 plan, 50 bought

    def adjust(delta: int) -> None:
        adjust_credits(
            db,
            get_or_create_billing(db, sample_user),
            kind="ai",
            delta=delta,
            admin_user_id=admin_user.id,
            target_user_id=sample_user.id,
            reason="Support",
        )

    adjust(10)
    assert _pools(db, sample_user, "ai") == (85, 50)
    adjust(-40)
    assert _pools(db, sample_user, "ai") == (45, 45)
    adjust(-100)
    assert _pools(db, sample_user, "ai") == (0, 0)
