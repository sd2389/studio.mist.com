"""TDD tests for render_credits quota kind (Task 1)."""

import pytest
from fastapi import HTTPException

from app.features.billing.plans import PLAN_QUOTAS
from app.features.billing.quota_service import (
    assert_render_credit,
    consume_render_credit,
    get_or_create_billing,
)


def test_plan_quotas_define_render_credits():
    assert PLAN_QUOTAS["free"].render_credits == 25
    assert PLAN_QUOTAS["grow"].render_credits == 300
    assert PLAN_QUOTAS["studio"].render_credits == 1500


def test_assert_render_credit_passes_with_balance(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    billing.render_credits_balance = 1
    db.commit()
    assert assert_render_credit(db, sample_user) is billing


def test_assert_render_credit_402_when_empty(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    billing.render_credits_balance = 0
    db.commit()
    with pytest.raises(HTTPException) as exc:
        assert_render_credit(db, sample_user)
    assert exc.value.status_code == 402


def test_consume_render_credit_decrements(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    billing.render_credits_balance = 2
    db.commit()
    consume_render_credit(db, billing)
    assert billing.render_credits_balance == 1
