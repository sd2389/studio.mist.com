"""Money-path tests — quota consume, adjust, refund math (Phase 17)."""

from app.features.billing.plans import get_quotas
from app.features.billing.quota_service import (
    adjust_credits,
    assert_model_credit,
    consume_model_credit,
    get_or_create_billing,
    refund_model_credit,
)


def test_consume_model_credit_decrements_balance(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    start = billing.model_credits_balance
    assert_model_credit(db, sample_user)
    consume_model_credit(db, billing)
    db.refresh(billing)
    assert billing.model_credits_balance == start - 1


def test_adjust_credits_grant_and_deduct(db, sample_user, admin_user):
    billing = get_or_create_billing(db, sample_user)
    start = billing.model_credits_balance

    adjust_credits(
        db,
        billing,
        kind="model",
        delta=10,
        admin_user_id=admin_user.id,
        target_user_id=sample_user.id,
        reason="Comp for outage",
    )
    db.refresh(billing)
    assert billing.model_credits_balance == start + 10

    adjust_credits(
        db,
        billing,
        kind="model",
        delta=-5,
        admin_user_id=admin_user.id,
        target_user_id=sample_user.id,
        reason="Correction",
    )
    db.refresh(billing)
    assert billing.model_credits_balance == start + 5


def test_refund_model_credit_after_consume(db, sample_user, admin_user):
    billing = get_or_create_billing(db, sample_user)
    start = billing.model_credits_balance
    consume_model_credit(db, billing)
    db.refresh(billing)
    assert billing.model_credits_balance == start - 1

    refund_model_credit(
        db,
        billing,
        admin_user_id=admin_user.id,
        reason="Upload failed — refund",
    )
    db.refresh(billing)
    assert billing.model_credits_balance == start


def test_credits_never_go_negative(db, sample_user, admin_user):
    billing = get_or_create_billing(db, sample_user)
    billing.model_credits_balance = 2
    db.commit()

    adjust_credits(
        db,
        billing,
        kind="model",
        delta=-100,
        admin_user_id=admin_user.id,
        target_user_id=sample_user.id,
        reason="Large deduction clamped",
    )
    db.refresh(billing)
    assert billing.model_credits_balance == 0


def test_reset_allotments_replaces_balances(db, sample_user):
    from app.features.billing.quota_service import reset_allotments

    billing = get_or_create_billing(db, sample_user)
    billing.model_credits_balance = 1
    db.commit()

    reset_allotments(db, billing, "grow")
    db.refresh(billing)
    grow = get_quotas("grow")
    assert billing.plan_tier == "grow"
    assert billing.model_credits_balance == grow.model_credits
    assert billing.ai_image_credits_balance == grow.ai_image_credits
