"""Money-path tests — Stripe webhook idempotency (Phase 17)."""

import hashlib
import hmac
import json
import time
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.features.billing.quota_service import get_or_create_billing
from app.features.billing.stripe_service import _record_event, handle_webhook
from app.models.billing import BillingEvent, CreditPurchase

WEBHOOK_SECRET = "whsec_test"


def _stripe_signature(payload: str, secret: str) -> str:
    """A Stripe-Signature header for the payload, signed the way Stripe signs webhooks."""
    timestamp = int(time.time())
    digest = hmac.new(secret.encode(), f"{timestamp}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def _topup_event(user_id: int, *, event_id: str, session_id: str) -> dict:
    return {
        "id": event_id,
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "mode": "payment",
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


def _deliver_signed(db, event: dict):
    """Send the event through handle_webhook as a payload Stripe signed; returns the
    result and the receipt email mock."""
    payload = json.dumps(event)
    with patch("app.features.billing.stripe_service.get_settings") as mock_settings:
        mock_settings.return_value.stripe_webhook_secret = WEBHOOK_SECRET
        with patch(
            "app.features.billing.stripe_service.billing_email.send_payment_receipt_email"
        ) as receipt:
            result = handle_webhook(db, payload.encode(), _stripe_signature(payload, WEBHOOK_SECRET))
    return result, receipt


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


def test_topup_webhook_records_the_purchase(db, sample_user):
    result, receipt = _deliver_signed(
        db, _topup_event(sample_user.id, event_id="evt_ledger", session_id="cs_ledger")
    )
    purchase = db.scalars(select(CreditPurchase)).one()

    assert result == {"status": "ok"}
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


def test_webhook_rejects_invalid_signature(db):
    with patch("app.features.billing.stripe_service.stripe.Webhook.construct_event") as construct:
        import stripe

        construct.side_effect = stripe.SignatureVerificationError("bad sig", "sig")
        with patch("app.features.billing.stripe_service.get_settings") as mock_settings:
            mock_settings.return_value.stripe_webhook_secret = "whsec_test"
            with pytest.raises(HTTPException) as exc:
                handle_webhook(db, b"{}", "bad")
    assert exc.value.status_code == 400
