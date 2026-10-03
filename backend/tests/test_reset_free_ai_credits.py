"""Free AI credit reset: who is lowered, to what, and what the script refuses to do."""

from dataclasses import replace
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import stripe
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.billing import plans
from app.features.billing.free_ai_credit_reset import (
    AUDIT_KIND,
    apply_free_ai_reset,
    plan_free_ai_reset,
)
from app.features.billing.purchases import record_topup_purchase
from app.features.billing.quota_service import adjust_credits, get_or_create_billing
from app.models.billing import CreditAdjustment, UserBilling
from app.models.user import User
from scripts import reset_free_ai_credits as script

ALLOWANCE = plans.get_quotas("free").ai_image_credits
REASON = f"Free AI allowance moved to {ALLOWANCE}"


def _account(
    db, name: str, *, plan: str = "free", ai_credits: int = 150, customer: str | None = None
) -> int:
    now = datetime.utcnow()
    user = User(email=f"{name}@example.com", password_hash="hash", created_at=now, updated_at=now)
    db.add(user)
    db.commit()
    billing = get_or_create_billing(db, user)
    billing.plan_tier = plan
    billing.ai_image_credits_balance = ai_credits
    billing.stripe_customer_id = customer
    db.commit()
    return user.id


def _billing(db, user_id: int) -> UserBilling:
    return db.scalars(select(UserBilling).where(UserBilling.user_id == user_id)).one()


def _ai_credits(db, user_id: int) -> int:
    """The stored balance, read from the table rather than a loaded object."""
    return db.scalar(
        select(UserBilling.ai_image_credits_balance).where(UserBilling.user_id == user_id)
    )


def _buy(db, user_id: int, session_id: str, *, credits: int = 50, kind: str = "ai") -> None:
    """A top-up through the purchase ledger; like the webhook, it adds the credits too."""
    billing = _billing(db, user_id)
    record_topup_purchase(
        db,
        billing,
        kind=kind,
        credits=credits,
        session_id=session_id,
        event_id=f"evt_{session_id}",
        amount_total=None,
        currency=None,
    )


def _grant(db, admin_id: int, user_id: int, delta: int, *, kind: str = "ai") -> None:
    adjust_credits(
        db,
        _billing(db, user_id),
        kind=kind,
        delta=delta,
        admin_user_id=admin_id,
        target_user_id=user_id,
        reason="Comp",
    )


def _checkout_session(session_id: str, *, kind: str = "ai", credits: int = 50, paid: bool = True):
    return stripe.checkout.Session.construct_from(
        {
            "id": session_id,
            "object": "checkout.session",
            "mode": "payment",
            "status": "complete",
            "payment_status": "paid" if paid else "unpaid",
            "metadata": {"topup_kind": kind, "topup_credits": str(credits)},
        },
        "sk_test_fake",
    )


def _stripe_client(sessions_by_customer: dict[str, list]) -> MagicMock:
    """A Stripe client whose Checkout Session list pages through these sessions per customer."""
    client = MagicMock()

    def list_sessions(params):
        page = MagicMock()
        page.auto_paging_iter.return_value = iter(sessions_by_customer.get(params["customer"], []))
        return page

    client.v1.checkout.sessions.list.side_effect = list_sessions
    return client


def _plan(db, stripe_client=None) -> dict[int, tuple[int, int, int, int]]:
    """user id -> (current, paid, granted, new)"""
    return {
        reset.user_id: (reset.current, reset.paid, reset.granted, reset.new)
        for reset in plan_free_ai_reset(db, stripe_client)
    }


def _audit_rows(db) -> list[CreditAdjustment]:
    return db.scalars(
        select(CreditAdjustment)
        .where(CreditAdjustment.kind == AUDIT_KIND)
        .order_by(CreditAdjustment.id)
    ).all()


def test_free_account_without_purchases_drops_to_the_allowance(db):
    user_id = _account(db, "plain")

    assert _plan(db) == {user_id: (150, 0, 0, ALLOWANCE)}


def test_ai_purchases_in_the_ledger_are_kept(db):
    user_id = _account(db, "buyer")
    _buy(db, user_id, "cs_ai")  # 150 + 50
    _buy(db, user_id, "cs_models", kind="model", credits=10)

    assert _plan(db) == {user_id: (200, 50, 0, ALLOWANCE + 50)}


def test_ai_purchases_only_in_stripe_are_kept(db):
    user_id = _account(db, "early_buyer", ai_credits=300, customer="cus_early")
    stripe_client = _stripe_client(
        {
            "cus_early": [
                _checkout_session("cs_before_the_ledger", credits=150),
                _checkout_session("cs_unpaid", paid=False),
                _checkout_session("cs_models", kind="model", credits=25),
            ]
        }
    )

    assert _plan(db, stripe_client) == {user_id: (300, 150, 0, ALLOWANCE + 150)}
    stripe_client.v1.checkout.sessions.list.assert_called_once_with(
        params={"customer": "cus_early", "status": "complete", "limit": 100}
    )


def test_purchase_in_both_ledger_and_stripe_counts_once(db):
    user_id = _account(db, "both", customer="cus_both")
    _buy(db, user_id, "cs_both")  # 150 + 50
    stripe_client = _stripe_client({"cus_both": [_checkout_session("cs_both")]})

    assert _plan(db, stripe_client) == {user_id: (200, 50, 0, ALLOWANCE + 50)}


def test_admin_ai_grants_are_kept(db, admin_user):
    user_id = _account(db, "comped")
    _grant(db, admin_user.id, user_id, 40)
    _grant(db, admin_user.id, user_id, -5)
    _grant(db, admin_user.id, user_id, 10, kind="model")

    assert _plan(db) == {user_id: (185, 0, 40, ALLOWANCE + 40)}


def test_balance_never_goes_up(db):
    user_id = _account(db, "spender", ai_credits=60, customer="cus_spender")
    stripe_client = _stripe_client({"cus_spender": [_checkout_session("cs_spent", credits=150)]})

    assert _plan(db, stripe_client) == {user_id: (60, 150, 0, 60)}


def test_accounts_within_the_allowance_and_paid_plans_are_left_alone(db, admin_user):
    at_allowance = _account(db, "at", ai_credits=ALLOWANCE)
    below = _account(db, "below", ai_credits=3)
    grow = _account(db, "grow", plan="grow", ai_credits=150)
    studio = _account(db, "studio", plan="studio", ai_credits=500)

    assert _plan(db) == {}
    apply_free_ai_reset(db, plan_free_ai_reset(db, None), admin_user_id=admin_user.id)

    balances = [_ai_credits(db, user_id) for user_id in (at_allowance, below, grow, studio)]
    assert balances == [ALLOWANCE, 3, 150, 500]
    assert _audit_rows(db) == []


def test_allowance_is_read_from_plans(db, monkeypatch, admin_user):
    free_with_40 = replace(plans.PLAN_QUOTAS["free"], ai_image_credits=40)
    monkeypatch.setitem(plans.PLAN_QUOTAS, "free", free_with_40)
    user_id = _account(db, "plain")

    apply_free_ai_reset(db, plan_free_ai_reset(db, None), admin_user_id=admin_user.id)

    assert _ai_credits(db, user_id) == 40
    assert [row.reason for row in _audit_rows(db)] == ["Free AI allowance moved to 40"]


def test_apply_reads_each_balance_again(db, admin_user):
    """Changes made elsewhere after the plan win: credits spent since stay spent (no balance
    goes back up), and an account that moved to a paid plan is left alone."""
    spent = _account(db, "spent")
    upgraded = _account(db, "upgraded")
    resets = plan_free_ai_reset(db, None)
    # Keep the rows loaded in this session, as a long-lived one would: apply must read afresh.
    loaded_rows = db.scalars(select(UserBilling)).all()
    with Session(db.get_bind()) as elsewhere:
        _billing(elsewhere, spent).ai_image_credits_balance = ALLOWANCE - 5
        _billing(elsewhere, upgraded).plan_tier = "grow"
        elsewhere.commit()

    assert apply_free_ai_reset(db, resets, admin_user_id=admin_user.id) == []
    assert (_ai_credits(db, spent), _ai_credits(db, upgraded)) == (ALLOWANCE - 5, 150)
    assert _audit_rows(db) == []
    assert all(row in db for row in loaded_rows)


@pytest.fixture()
def run_script(db, monkeypatch):
    """Run the CLI on the test database, with a Stripe key unless told otherwise."""

    def run(*argv: str, stripe_key: str | None = "sk_test_123", stripe_client=None) -> int:
        settings = SimpleNamespace(stripe_secret_key=stripe_key)
        monkeypatch.setattr(script, "SessionLocal", lambda: db)
        monkeypatch.setattr(script, "get_settings", lambda: settings)
        monkeypatch.setattr(
            script, "build_stripe_client", lambda key: stripe_client or _stripe_client({})
        )
        return script.main(list(argv))

    return run


def test_credits_added_after_the_plan_are_kept(db, admin_user):
    """A purchase that lands between the plan and --apply keeps its credits."""
    late_buyer = _account(db, "late-buyer")
    resets = plan_free_ai_reset(db, None)
    with Session(db.get_bind()) as elsewhere:
        _buy(elsewhere, late_buyer, "cs_after_plan", credits=50)

    apply_free_ai_reset(db, resets, admin_user_id=admin_user.id)

    assert _ai_credits(db, late_buyer) == ALLOWANCE + 50


def test_dry_run_prints_the_plan_and_changes_nothing(db, run_script, capsys):
    plain = _account(db, "plain")
    _account(db, "grow", plan="grow")

    assert run_script() == 0

    out = capsys.readouterr().out
    assert f"{plain:>8}  free         150         0         0  {ALLOWANCE:>8}" in out
    assert "test mode" in out
    assert "Dry run: nothing was changed" in out
    assert "@" not in out  # user ids only, no emails
    assert _ai_credits(db, plain) == 150
    assert _audit_rows(db) == []


def test_apply_lowers_balances_with_one_audit_row_each(db, run_script, admin_user, capsys):
    admin_id = admin_user.id  # the script closes the session, which detaches fixture objects
    plain = _account(db, "plain")
    buyer = _account(db, "buyer")
    _buy(db, buyer, "cs_ai")  # 200
    early = _account(db, "early_buyer", ai_credits=60, customer="cus_early")
    stripe_client = _stripe_client({"cus_early": [_checkout_session("cs_old", credits=50)]})

    assert run_script("--apply", "--admin-id", str(admin_id), stripe_client=stripe_client) == 0

    assert [_ai_credits(db, user_id) for user_id in (plain, buyer, early)] == [
        ALLOWANCE,
        ALLOWANCE + 50,
        60,
    ]
    rows = _audit_rows(db)
    assert [(row.target_user_id, row.delta) for row in rows] == [
        (plain, ALLOWANCE - 150),
        (buyer, ALLOWANCE + 50 - 200),
    ]
    assert {(row.admin_user_id, row.reason) for row in rows} == {(admin_id, REASON)}
    assert "Applied: lowered 2 balances" in capsys.readouterr().out

    assert run_script("--apply", "--admin-id", str(admin_id), stripe_client=stripe_client) == 0
    assert len(_audit_rows(db)) == 2  # a second run finds nothing left to lower


def test_apply_without_admin_id_is_refused(db, run_script):
    plain = _account(db, "plain")

    with pytest.raises(SystemExit) as exit_info:
        run_script("--apply")

    assert exit_info.value.code == 2
    assert _ai_credits(db, plain) == 150


@pytest.mark.parametrize("who", ["regular user", "disabled admin", "nobody"])
def test_apply_as_anyone_but_an_active_admin_is_refused(db, run_script, sample_user, capsys, who):
    plain = _account(db, "plain")
    if who == "disabled admin":
        sample_user.role = "admin"
        sample_user.is_active = False
        db.commit()
    admin_id = 9999 if who == "nobody" else sample_user.id

    assert run_script("--apply", "--admin-id", str(admin_id)) == 1

    assert "Refusing to run" in capsys.readouterr().err
    assert _ai_credits(db, plain) == 150
    assert db.scalar(select(func.count(CreditAdjustment.id))) == 0


def test_without_stripe_configured_it_refuses_unless_told_to_skip_stripe(db, run_script, capsys):
    buyer = _account(db, "buyer")
    _buy(db, buyer, "cs_ai")  # 200

    assert run_script(stripe_key=None) == 1
    assert "--no-stripe" in capsys.readouterr().err

    assert run_script("--no-stripe", stripe_key=None) == 0
    out = capsys.readouterr().out
    assert "Stripe: not checked (--no-stripe)" in out
    assert f"{buyer:>8}  free         200        50         0  {ALLOWANCE + 50:>8}" in out
