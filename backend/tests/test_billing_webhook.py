"""Money-path tests — Stripe webhook idempotency (Phase 17)."""

import hashlib
import hmac
import json
import time
from contextlib import contextmanager
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import stripe
from fastapi import HTTPException
from sqlalchemy import func, select

from app.features.billing.plans import PLAN_LABELS, get_quotas
from app.features.billing.quota_service import get_or_create_billing
from app.features.billing.stripe_service import _record_event, handle_webhook
from app.models.billing import BillingEvent, CreditPurchase

WEBHOOK_SECRET = "whsec_test"
SERVICE = "app.features.billing.stripe_service"

# A Grow subscription as the Stripe API returns it (the period lives on the items).
GROW_SUBSCRIPTION = {
    "id": "sub_grow",
    "object": "subscription",
    "customer": "cus_grow",
    "status": "active",
    "items": {
        "object": "list",
        "data": [
            {
                "id": "si_grow",
                "object": "subscription_item",
                "price": {"id": "price_grow", "object": "price"},
                "current_period_start": 1790000000,
                "current_period_end": 1792592000,
            }
        ],
    },
}
# GROW_SUBSCRIPTION's billing period as the account stores it (naive UTC).
GROW_PERIOD = (datetime(2026, 9, 21, 14, 13, 20), datetime(2026, 10, 21, 14, 13, 20))


def _stripe_signature(payload: str, secret: str) -> str:
    """A Stripe-Signature header for the payload, signed the way Stripe signs webhooks."""
    timestamp = int(time.time())
    digest = hmac.new(secret.encode(), f"{timestamp}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def _topup_event(
    user_id: int,
    *,
    event_id: str,
    session_id: str,
    event_type: str = "checkout.session.completed",
    payment_status: str = "paid",
) -> dict:
    return {
        "id": event_id,
        "object": "event",
        "type": event_type,
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "mode": "payment",
                "status": "complete",
                "payment_status": payment_status,
                "amount_total": 1900,
                "currency": "usd",
                "metadata": {
                    "user_id": str(user_id),
                    "pack_id": "ai_50",
                    "topup_kind": "ai",
                    "topup_credits": "50",
                },
            }
        },
    }


def _subscription_checkout_event(
    user_id: int,
    *,
    event_id: str,
    event_type: str = "checkout.session.completed",
    payment_status: str = "paid",
) -> dict:
    return {
        "id": event_id,
        "object": "event",
        "type": event_type,
        "data": {
            "object": {
                "id": "cs_grow",
                "object": "checkout.session",
                "mode": "subscription",
                "status": "complete",
                "payment_status": payment_status,
                "customer": "cus_grow",
                "subscription": "sub_grow",
                "amount_total": 4900,
                "currency": "usd",
                "metadata": {"user_id": str(user_id), "plan_tier": "grow"},
            }
        },
    }


@contextmanager
def _stripe_test_env(subscription: dict | None = None):
    """Webhook settings, mocked emails, and a Stripe API that returns `subscription`."""
    client = MagicMock()
    if subscription is not None:
        client.subscriptions.retrieve.return_value = stripe.Subscription.construct_from(
            subscription, "sk_test_fake"
        )
    with (
        patch(f"{SERVICE}.get_settings") as mock_settings,
        patch(f"{SERVICE}._stripe_client", return_value=client),
        patch(f"{SERVICE}.billing_email.send_payment_receipt_email") as receipt,
        patch(f"{SERVICE}.billing_email.send_subscription_updated_email") as plan_email,
    ):
        mock_settings.return_value.stripe_webhook_secret = WEBHOOK_SECRET
        mock_settings.return_value.stripe_price_grow = "price_grow"
        mock_settings.return_value.stripe_price_studio = "price_studio"
        yield SimpleNamespace(stripe=client, receipt=receipt, plan_email=plan_email)


def _send_signed(db, event: dict) -> dict:
    payload = json.dumps(event)
    return handle_webhook(db, payload.encode(), _stripe_signature(payload, WEBHOOK_SECRET))


def _deliver_signed(db, event: dict):
    """Send the event through handle_webhook as a payload Stripe signed; returns the
    result and the receipt email mock."""
    with _stripe_test_env() as env:
        result = _send_signed(db, event)
    return result, env.receipt


def _purchase_count(db) -> int:
    return db.scalar(select(func.count(CreditPurchase.id)))


def test_record_event_is_idempotent(db):
    assert _record_event(db, "evt_123", "checkout.session.completed") is True
    assert _record_event(db, "evt_123", "checkout.session.completed") is False

    rows = db.scalars(select(BillingEvent).where(BillingEvent.stripe_event_id == "evt_123")).all()
    assert len(rows) == 1


def test_duplicate_webhook_does_not_double_apply_topup(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    start = billing.ai_image_credits_balance

    payload = b"{}"
    signature = "sig_test"

    mock_event = {
        "id": "evt_topup_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_topup_1",
                "mode": "payment",
                "payment_status": "paid",
                "metadata": {
                    "user_id": str(sample_user.id),
                    "topup_kind": "ai",
                    "topup_credits": "50",
                    "pack_id": "ai_50",
                },
            }
        },
    }

    with patch("app.features.billing.stripe_service.stripe.Webhook.construct_event", return_value=mock_event):
        with patch("app.features.billing.stripe_service.get_settings") as mock_settings:
            mock_settings.return_value.stripe_webhook_secret = "whsec_test"
            with patch("app.features.billing.stripe_service.billing_email.send_payment_receipt_email"):
                result1 = handle_webhook(db, payload, signature)
                db.refresh(billing)
                after_first = billing.ai_image_credits_balance

                result2 = handle_webhook(db, payload, signature)
                db.refresh(billing)

    assert result1 == {"status": "ok"}
    assert result2 == {"status": "already_processed"}
    assert after_first == start + 50
    assert billing.ai_image_credits_balance == after_first
    assert _purchase_count(db) == 1


def test_signed_topup_webhook_reads_metadata_from_stripe_objects(db, sample_user):
    """The real construct_event hands over StripeObjects, not dicts, down to the metadata."""
    billing = get_or_create_billing(db, sample_user)
    start = billing.ai_image_credits_balance

    result, _ = _deliver_signed(
        db, _topup_event(sample_user.id, event_id="evt_signed_topup", session_id="cs_signed_topup")
    )
    db.refresh(billing)

    assert result == {"status": "ok"}
    assert billing.ai_image_credits_balance == start + 50


def test_paid_topup_adds_credits_and_records_the_purchase(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    start = billing.ai_image_credits_balance

    result, receipt = _deliver_signed(
        db, _topup_event(sample_user.id, event_id="evt_ledger", session_id="cs_ledger")
    )
    db.refresh(billing)
    purchase = db.scalars(select(CreditPurchase)).one()

    assert result == {"status": "ok"}
    assert billing.ai_image_credits_balance == start + 50
    assert (purchase.user_id, purchase.kind, purchase.credits) == (sample_user.id, "ai", 50)
    assert purchase.stripe_checkout_session_id == "cs_ledger"
    assert purchase.stripe_event_id == "evt_ledger"
    assert (purchase.amount_total, purchase.currency) == (1900, "usd")
    receipt.assert_called_once()


def test_replayed_topup_is_not_paid_out_twice(db, sample_user):
    """Say the first delivery added the credits but was never marked processed: Stripe sends
    it again, and the purchase ledger, keyed by session id, stops a second grant."""
    billing = get_or_create_billing(db, sample_user)
    start = billing.ai_image_credits_balance

    _deliver_signed(db, _topup_event(sample_user.id, event_id="evt_first", session_id="cs_once"))
    db.execute(BillingEvent.__table__.delete())
    db.commit()
    result, receipt = _deliver_signed(
        db, _topup_event(sample_user.id, event_id="evt_first", session_id="cs_once")
    )
    db.refresh(billing)

    assert result == {"status": "ok"}
    assert billing.ai_image_credits_balance == start + 50
    assert _purchase_count(db) == 1
    receipt.assert_not_called()


def test_unpaid_topup_is_granted_once_when_its_delayed_payment_succeeds(db, sample_user):
    """A bank debit completes the checkout unpaid; credits wait for async_payment_succeeded."""
    billing = get_or_create_billing(db, sample_user)
    start = billing.ai_image_credits_balance

    with _stripe_test_env() as env:
        completed = _topup_event(
            sample_user.id, event_id="evt_unpaid", session_id="cs_debit", payment_status="unpaid"
        )
        assert _send_signed(db, completed) == {"status": "ok"}
        db.refresh(billing)
        assert billing.ai_image_credits_balance == start
        assert _purchase_count(db) == 0

        for event_id in ("evt_cleared", "evt_cleared_again"):  # Stripe may send it twice
            cleared = _topup_event(
                sample_user.id,
                event_id=event_id,
                session_id="cs_debit",
                event_type="checkout.session.async_payment_succeeded",
            )
            assert _send_signed(db, cleared) == {"status": "ok"}
    db.refresh(billing)

    assert billing.ai_image_credits_balance == start + 50
    assert _purchase_count(db) == 1
    env.receipt.assert_called_once()


def test_failed_delayed_topup_payment_grants_nothing(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    start = billing.ai_image_credits_balance

    with _stripe_test_env() as env:
        for event_id, event_type, payment_status in (
            ("evt_pending", "checkout.session.completed", "unpaid"),
            ("evt_failed", "checkout.session.async_payment_failed", "unpaid"),
        ):
            event = _topup_event(
                sample_user.id,
                event_id=event_id,
                session_id="cs_bounced",
                event_type=event_type,
                payment_status=payment_status,
            )
            assert _send_signed(db, event) == {"status": "ok"}
    db.refresh(billing)

    assert billing.ai_image_credits_balance == start
    assert _purchase_count(db) == 0
    env.receipt.assert_not_called()


def test_subscription_checkout_starts_the_plan_only_once_paid(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    start = billing.ai_image_credits_balance

    with _stripe_test_env(subscription=GROW_SUBSCRIPTION) as env:
        unpaid = _subscription_checkout_event(
            sample_user.id, event_id="evt_sub_unpaid", payment_status="unpaid"
        )
        _send_signed(db, unpaid)
        db.refresh(billing)
        assert (billing.plan_tier, billing.ai_image_credits_balance) == ("free", start)
        env.stripe.subscriptions.retrieve.assert_not_called()

        cleared = _subscription_checkout_event(
            sample_user.id,
            event_id="evt_sub_cleared",
            event_type="checkout.session.async_payment_succeeded",
        )
        _send_signed(db, cleared)
    db.refresh(billing)

    assert (billing.plan_tier, billing.stripe_subscription_id) == ("grow", "sub_grow")
    assert billing.ai_image_credits_balance == get_quotas("grow").ai_image_credits
    env.stripe.subscriptions.retrieve.assert_called_once_with("sub_grow")
    env.plan_email.assert_called_once()


def test_webhook_rejects_invalid_signature(db):
    with patch("app.features.billing.stripe_service.stripe.Webhook.construct_event") as construct:
        import stripe

        construct.side_effect = stripe.SignatureVerificationError("bad sig", "sig")
        with patch("app.features.billing.stripe_service.get_settings") as mock_settings:
            mock_settings.return_value.stripe_webhook_secret = "whsec_test"
            with pytest.raises(HTTPException) as exc:
                handle_webhook(db, b"{}", "bad")
    assert exc.value.status_code == 400


def test_signed_subscription_update_moves_the_customer_to_grow(db, sample_user):
    """A plan change made in the Stripe portal arrives as customer.subscription.updated."""
    billing = get_or_create_billing(db, sample_user)
    billing.stripe_customer_id = "cus_grow"
    db.commit()
    event = {
        "id": "evt_portal_upgrade",
        "object": "event",
        "type": "customer.subscription.updated",
        "data": {"object": GROW_SUBSCRIPTION},
    }

    with _stripe_test_env() as env:
        result = _send_signed(db, event)
    db.refresh(billing)

    assert result == {"status": "ok"}
    assert (billing.plan_tier, billing.stripe_subscription_id) == ("grow", "sub_grow")
    assert (billing.period_start, billing.period_end) == GROW_PERIOD
    env.plan_email.assert_called_once_with(
        to=sample_user.email, plan_label=PLAN_LABELS["grow"], action="updated"
    )
