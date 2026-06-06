"""Money-path tests — Stripe webhook idempotency (Phase 17)."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.features.billing.quota_service import get_or_create_billing
from app.features.billing.stripe_service import _record_event, handle_webhook
from app.models.billing import BillingEvent


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


def test_webhook_rejects_invalid_signature(db):
    with patch("app.features.billing.stripe_service.stripe.Webhook.construct_event") as construct:
        import stripe

        construct.side_effect = stripe.SignatureVerificationError("bad sig", "sig")
        with patch("app.features.billing.stripe_service.get_settings") as mock_settings:
            mock_settings.return_value.stripe_webhook_secret = "whsec_test"
            with pytest.raises(HTTPException) as exc:
                handle_webhook(db, b"{}", "bad")
    assert exc.value.status_code == 400
