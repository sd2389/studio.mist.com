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


def test_consume_model_credit_counts_the_upload_and_waits_for_the_callers_commit(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    start = billing.model_credits_balance

    consume_model_credit(db, billing, 500)
    db.rollback()
    db.refresh(billing)
    assert (billing.model_credits_balance, billing.storage_bytes_used) == (start, 0)

    consume_model_credit(db, billing, 500)
    db.commit()
    db.refresh(billing)
    assert (billing.model_credits_balance, billing.storage_bytes_used) == (start - 1, 500)


def test_consume_model_credit_refuses_a_credit_another_save_already_spent(db, sample_user):
    """The balance in memory says 1, but a concurrent save took it: no second spend."""
    import pytest
    from fastapi import HTTPException
    from sqlalchemy import update

    from app.models.billing import UserBilling

    billing = get_or_create_billing(db, sample_user)
    billing.model_credits_balance = 1
    db.commit()
    db.execute(update(UserBilling.__table__).where(UserBilling.__table__.c.id == billing.id).values(model_credits_balance=0))

    with pytest.raises(HTTPException) as exc:
        consume_model_credit(db, billing)
    assert exc.value.status_code == 402


def test_consume_model_credit_refuses_bytes_past_the_storage_limit(db, sample_user):
    """A save that would take storage past the plan's limit spends nothing, even with credits left."""
    import pytest
    from fastapi import HTTPException

    billing = get_or_create_billing(db, sample_user)
    limit = get_quotas("free").storage_bytes
    billing.model_credits_balance = 2
    billing.storage_bytes_used = limit - 100
    db.commit()

    with pytest.raises(HTTPException) as exc:
        consume_model_credit(db, billing, 101)
    assert exc.value.status_code == 402
    assert "Storage limit" in exc.value.detail
    db.refresh(billing)
    assert (billing.model_credits_balance, billing.storage_bytes_used) == (2, limit - 100)

    consume_model_credit(db, billing, 100)
    db.commit()
    db.refresh(billing)
    assert (billing.model_credits_balance, billing.storage_bytes_used) == (1, limit)


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
