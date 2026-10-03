"""Purchase ledger: a paid top-up adds its credits once per Checkout Session."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.admin.service import get_user_detail
from app.features.billing import purchases
from app.features.billing.purchases import record_topup_purchase
from app.features.billing.quota_service import get_or_create_billing
from app.models.billing import CreditPurchase, UserBilling


def _record(db, billing, *, session_id: str = "cs_1", kind: str = "ai", credits: int = 50) -> bool:
    return record_topup_purchase(
        db,
        billing,
        kind=kind,
        credits=credits,
        session_id=session_id,
        event_id="evt_1",
        amount_total=1900,
        currency="usd",
    )


def _purchase_count(db) -> int:
    return db.scalar(select(func.count(CreditPurchase.id)))


def test_purchase_adds_its_credits_and_ledger_row(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    start_ai = billing.ai_image_credits_balance
    start_model = billing.model_credits_balance

    assert _record(db, billing, session_id="cs_ai") is True
    assert _record(db, billing, session_id="cs_model", kind="model", credits=10) is True
    db.refresh(billing)

    assert billing.ai_image_credits_balance == start_ai + 50
    assert billing.model_credits_balance == start_model + 10
    rows = db.scalars(select(CreditPurchase).order_by(CreditPurchase.id)).all()
    assert [(row.kind, row.credits, row.stripe_checkout_session_id) for row in rows] == [
        ("ai", 50, "cs_ai"),
        ("model", 10, "cs_model"),
    ]


def test_recorded_session_adds_nothing(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    _record(db, billing)
    db.refresh(billing)
    after_first = billing.ai_image_credits_balance

    assert _record(db, billing) is False
    db.refresh(billing)

    assert billing.ai_image_credits_balance == after_first
    assert _purchase_count(db) == 1


def test_simultaneous_duplicate_is_stopped_by_the_unique_session_id(db, sample_user, monkeypatch):
    """Two deliveries can both pass the lookup; the second insert fails and its credits roll back."""
    billing = get_or_create_billing(db, sample_user)
    _record(db, billing)
    db.refresh(billing)
    after_first = billing.ai_image_credits_balance

    real_lookup = purchases._is_session_recorded
    lookups: list[str] = []

    def lookup_that_misses_once(session, session_id):
        lookups.append(session_id)
        return len(lookups) > 1 and real_lookup(session, session_id)

    monkeypatch.setattr(purchases, "_is_session_recorded", lookup_that_misses_once)

    assert _record(db, billing) is False
    db.refresh(billing)

    assert lookups == ["cs_1", "cs_1"]  # the missed lookup, then the check after the rollback
    assert billing.ai_image_credits_balance == after_first
    assert _purchase_count(db) == 1


def test_admin_user_detail_lists_purchases_newest_first(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    _record(db, billing, session_id="cs_older")
    _record(db, billing, session_id="cs_newer", kind="model", credits=10)

    purchases_shown = get_user_detail(db, sample_user.id).recent_purchases

    assert [row.stripe_checkout_session_id for row in purchases_shown] == ["cs_newer", "cs_older"]
    newest = purchases_shown[0]
    assert (newest.kind, newest.credits, newest.stripe_event_id) == ("model", 10, "evt_1")
    assert (newest.amount_total, newest.currency) == (1900, "usd")


def test_two_purchases_committing_at_once_both_count(db, sample_user):
    """Each purchase adds in the database, so one can't overwrite the other's total."""
    billing = get_or_create_billing(db, sample_user)
    start = billing.ai_image_credits_balance
    # Another delivery adds its purchase while this session still holds the old balance.
    with Session(db.get_bind()) as elsewhere:
        assert _record(elsewhere, get_or_create_billing(elsewhere, sample_user), session_id="cs_a")

    assert _record(db, billing, session_id="cs_b") is True

    assert db.scalar(select(UserBilling.ai_image_credits_balance).where(UserBilling.id == billing.id)) == start + 100
    assert _purchase_count(db) == 2
