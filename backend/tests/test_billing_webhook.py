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

from app.features.billing.credit_pools import bought_credits
from app.features.billing.plans import PLAN_LABELS, get_quotas
from app.features.billing.purchases import record_topup_purchase
from app.features.billing.quota_service import (
    consume_ai_image_credit,
    get_or_create_billing,
    subscription_allowance_key,
)
from app.features.billing.stripe_service import _record_event, handle_webhook
from app.features.render_jobs import worker
from app.features.render_jobs.service import create_job
from app.models import Scene
from app.models.billing import BillingEvent, CreditPurchase
from app.schemas.render_job import RenderJobCreate

WEBHOOK_SECRET = "whsec_test"
SERVICE = "app.features.billing.stripe_service"
WORKER_SETTINGS = SimpleNamespace(render_job_lease_seconds=120, render_worker_token="secret")
FOUR_K_STILL = {"camera": {"pose": "pose-default"}, "width": 3840, "height": 2160}  # 2 render credits

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


def _subscription_event(
    event_id: str, event_type: str = "customer.subscription.updated", **changes
) -> dict:
    """A customer.subscription.* event for GROW_SUBSCRIPTION, with `changes` made to it."""
    return {
        "id": event_id,
        "object": "event",
        "type": event_type,
        "data": {"object": {**GROW_SUBSCRIPTION, **changes}},
    }


def _grow_customer_billing(db, user, **fields):
    """The user's billing row, linked to the Stripe customer GROW_SUBSCRIPTION belongs to."""
    billing = get_or_create_billing(db, user)
    billing.stripe_customer_id = "cus_grow"
    for name, value in fields.items():
        setattr(billing, name, value)
    db.commit()
    return billing


def _credit_balances(billing) -> tuple[int, ...]:
    return (
        billing.model_credits_balance,
        billing.ai_image_credits_balance,
        billing.render_credits_balance,
        billing.custom_material_credits_balance,
        billing.custom_asset_credits_balance,
    )


def test_signed_subscription_update_moves_the_customer_to_grow(db, sample_user):
    """A plan change made in the Stripe portal arrives as customer.subscription.updated. It
    changes the plan; the plan's credits come with the payment, not with this event."""
    billing = _grow_customer_billing(db, sample_user)
    credits_before = _credit_balances(billing)

    with _stripe_test_env() as env:
        result = _send_signed(db, _subscription_event("evt_upgrade"))
    db.refresh(billing)

    assert result == {"status": "ok"}
    assert (billing.plan_tier, billing.stripe_subscription_id) == ("grow", "sub_grow")
    assert (billing.period_start, billing.period_end) == GROW_PERIOD
    assert _credit_balances(billing) == credits_before
    env.plan_email.assert_called_once_with(
        to=sample_user.email, plan_label=PLAN_LABELS["grow"], action="updated"
    )


def test_subscription_update_on_the_same_plan_adds_no_credits(db, sample_user):
    """Renewals, card changes and cancel toggles send customer.subscription.updated too. They
    must not refill used credits or wipe bought ones, and need no plan email."""
    billing = _grow_customer_billing(
        db,
        sample_user,
        plan_tier="grow",
        stripe_subscription_id="sub_grow",
        ai_image_credits_balance=3,
    )
    credits_before = _credit_balances(billing)

    with _stripe_test_env() as env:
        result = _send_signed(db, _subscription_event("evt_card_change"))
    db.refresh(billing)

    assert result == {"status": "ok"}
    assert billing.plan_tier == "grow"
    assert _credit_balances(billing) == credits_before
    env.plan_email.assert_not_called()


def test_subscription_created_before_its_first_payment_clears_starts_no_plan(db, sample_user):
    billing = _grow_customer_billing(db, sample_user)
    credits_before = _credit_balances(billing)

    with _stripe_test_env() as env:
        created = _subscription_event(
            "evt_created_unpaid", "customer.subscription.created", status="incomplete"
        )
        _send_signed(db, created)
    db.refresh(billing)

    assert (billing.plan_tier, billing.stripe_subscription_id) == ("free", None)
    assert _credit_balances(billing) == credits_before
    env.plan_email.assert_not_called()


@pytest.mark.parametrize(
    "event_type", ["customer.subscription.updated", "customer.subscription.deleted"]
)
def test_an_older_subscription_ending_leaves_the_newer_plan(db, sample_user, event_type):
    """The customer moved from sub_grow to sub_new; sub_grow ending must not downgrade them."""
    billing = _grow_customer_billing(
        db, sample_user, plan_tier="studio", stripe_subscription_id="sub_new"
    )

    with _stripe_test_env() as env:
        _send_signed(db, _subscription_event("evt_old_ends", event_type, status="canceled"))
    db.refresh(billing)

    assert (billing.plan_tier, billing.stripe_subscription_id) == ("studio", "sub_new")
    env.plan_email.assert_not_called()


def test_the_current_subscription_ending_moves_the_customer_to_free(db, sample_user):
    billing = _grow_customer_billing(
        db, sample_user, plan_tier="grow", stripe_subscription_id="sub_grow"
    )

    with _stripe_test_env() as env:
        deleted = _subscription_event(
            "evt_cancelled", "customer.subscription.deleted", status="canceled"
        )
        _send_signed(db, deleted)
    db.refresh(billing)

    assert (billing.plan_tier, billing.stripe_subscription_id) == ("free", None)
    env.plan_email.assert_called_once_with(
        to=sample_user.email, plan_label=PLAN_LABELS["free"], action="cancelled"
    )


# ---------------------------------------------------------------------------
# Bought credits stay, and a period's allowance is granted once
# ---------------------------------------------------------------------------

# GROW_SUBSCRIPTION a month on, and the same customer on Studio.
GROW_RENEWED = {
    **GROW_SUBSCRIPTION,
    "items": {
        "object": "list",
        "data": [
            {
                **GROW_SUBSCRIPTION["items"]["data"][0],
                "current_period_start": 1792592000,
                "current_period_end": 1795270400,
            }
        ],
    },
}
STUDIO_SUBSCRIPTION = {
    **GROW_SUBSCRIPTION,
    "id": "sub_studio",
    "items": {
        "object": "list",
        "data": [
            {
                **GROW_SUBSCRIPTION["items"]["data"][0],
                "id": "si_studio",
                "price": {"id": "price_studio", "object": "price"},
            }
        ],
    },
}


def _invoice_paid_event(event_id: str, subscription: str | None = "sub_grow") -> dict:
    return {
        "id": event_id,
        "object": "event",
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": f"in_{event_id}",
                "object": "invoice",
                "customer": "cus_grow",
                "subscription": subscription,
                "amount_paid": 4900,
                "hosted_invoice_url": "https://invoice.example.com",
            }
        },
    }


def _checkout_event(user_id: int, event_id: str, subscription: str = "sub_grow") -> dict:
    event = _subscription_checkout_event(user_id, event_id=event_id)
    event["data"]["object"]["subscription"] = subscription
    return event


def _ai_pools(db, billing) -> tuple[int, int]:
    """(AI image credits, the bought ones among them)."""
    db.refresh(billing)
    return billing.ai_image_credits_balance, bought_credits(billing, "ai")


def _spend_ai_credits(db, billing, count: int) -> None:
    for _ in range(count):
        consume_ai_image_credit(db, billing)


def _grow_buyer(db, user):
    """A customer of cus_grow, still on Free, who bought 50 AI credits at a paid top-up checkout."""
    billing = _grow_customer_billing(db, user)
    _deliver_signed(db, _topup_event(user.id, event_id="evt_topup", session_id="cs_topup"))
    assert _ai_pools(db, billing) == (25 + 50, 50)
    return billing


def test_a_checkout_and_its_first_invoice_grant_the_period_once(db, sample_user):
    """Both arrive for the first payment. Credits spent between them stay spent."""
    billing = _grow_buyer(db, sample_user)
    grow = get_quotas("grow").ai_image_credits

    with _stripe_test_env(subscription=GROW_SUBSCRIPTION):
        _send_signed(db, _checkout_event(sample_user.id, "evt_checkout"))
        assert _ai_pools(db, billing) == (grow + 50, 50)
        _spend_ai_credits(db, billing, 10)
        _send_signed(db, _invoice_paid_event("evt_first_invoice"))

    assert _ai_pools(db, billing) == (grow + 40, 50)
    assert billing.allowance_granted_for == subscription_allowance_key("sub_grow", GROW_PERIOD[0], "grow")


def test_an_invoice_sent_again_under_a_new_event_id_grants_nothing(db, sample_user):
    billing = _grow_customer_billing(db, sample_user)
    grow = get_quotas("grow").ai_image_credits

    with _stripe_test_env(subscription=GROW_SUBSCRIPTION) as env:
        _send_signed(db, _invoice_paid_event("evt_invoice"))
        _spend_ai_credits(db, billing, 30)
        for event_id in ("evt_invoice_again", "evt_invoice_once_more"):
            assert _send_signed(db, _invoice_paid_event(event_id)) == {"status": "ok"}

    assert _ai_pools(db, billing) == (grow - 30, 0)
    assert env.receipt.call_count == 3  # each payment notice still gets its receipt


def test_a_renewal_grants_the_new_periods_allowance_and_keeps_bought_credits(db, sample_user):
    """customer.subscription.updated moves the period without credits (#49); the invoice.paid
    that follows grants the new period's allowance, keeping what is left of the bought credits."""
    billing = _grow_buyer(db, sample_user)
    grow = get_quotas("grow").ai_image_credits
    with _stripe_test_env(subscription=GROW_SUBSCRIPTION):
        _send_signed(db, _checkout_event(sample_user.id, "evt_checkout"))
    _spend_ai_credits(db, billing, grow + 20)  # the plan's credits, then 20 bought ones
    assert _ai_pools(db, billing) == (30, 30)

    with _stripe_test_env(subscription=GROW_RENEWED):
        _send_signed(db, _subscription_event("evt_renewed", items=GROW_RENEWED["items"]))
        assert _ai_pools(db, billing) == (30, 30)
        _send_signed(db, _invoice_paid_event("evt_renewal_invoice"))

    assert _ai_pools(db, billing) == (grow + 30, 30)
    assert billing.period_start == datetime(2026, 10, 21, 14, 13, 20)


def test_a_job_held_between_a_renewals_events_refunds_no_plan_credits_on_top_of_the_new_allowance(db, sample_user):
    """customer.subscription.updated moves the period before invoice.paid grants it. A job held
    in between spends the old period's last plan credit and a bought one; when it fails after the
    grant, the bought credit comes back and the plan one, replaced by the grant, doesn't."""
    billing = _grow_customer_billing(db, sample_user)
    grow = get_quotas("grow").render_credits
    with _stripe_test_env(subscription=GROW_SUBSCRIPTION):
        _send_signed(db, _checkout_event(sample_user.id, "evt_checkout"))
    billing.render_credits_balance = 1  # the period's last plan credit
    db.commit()
    record_topup_purchase(
        db, billing, kind="render", credits=10, session_id="cs_render", event_id="evt_render",
        amount_total=None, currency=None,
    )
    scene = Scene(user_id=sample_user.id, model_key=f"customers/{sample_user.id}/models/ring.glb", created_at=datetime.utcnow())
    db.add(scene)
    db.commit()

    with _stripe_test_env(subscription=GROW_RENEWED):
        _send_signed(db, _subscription_event("evt_renewed", items=GROW_RENEWED["items"]))
        job, _ = create_job(db, sample_user, RenderJobCreate(kind="still", scene_id=scene.id, spec=FOUR_K_STILL))
        assert (job.credits, job.bought_credits) == (2, 1)
        _send_signed(db, _invoice_paid_event("evt_renewal_invoice"))
    claimed = worker.claim_job(db, "gpu-a-1", ["still"], WORKER_SETTINGS)
    worker.fail_job(db, claimed.id, claimed.worker_token, error="lost", code="gpu_lost", retryable=False)

    db.refresh(billing)
    assert (billing.render_credits_balance, bought_credits(billing, "render")) == (grow + 10, 10)


def test_an_upgrade_keeps_bought_credits(db, sample_user):
    billing = _grow_buyer(db, sample_user)
    with _stripe_test_env(subscription=GROW_SUBSCRIPTION):
        _send_signed(db, _checkout_event(sample_user.id, "evt_grow"))

    with _stripe_test_env(subscription=STUDIO_SUBSCRIPTION):
        _send_signed(db, _checkout_event(sample_user.id, "evt_studio", subscription="sub_studio"))

    assert _ai_pools(db, billing) == (get_quotas("studio").ai_image_credits + 50, 50)
    assert (billing.plan_tier, billing.stripe_subscription_id) == ("studio", "sub_studio")


def test_a_cancellation_keeps_bought_credits_and_happens_once(db, sample_user):
    billing = _grow_buyer(db, sample_user)
    with _stripe_test_env(subscription=GROW_SUBSCRIPTION):
        _send_signed(db, _checkout_event(sample_user.id, "evt_checkout"))

    with _stripe_test_env(subscription={**GROW_SUBSCRIPTION, "status": "canceled"}):
        _send_signed(db, _subscription_event("evt_deleted", "customer.subscription.deleted", status="canceled"))
        assert _ai_pools(db, billing) == (25 + 50, 50)
        _spend_ai_credits(db, billing, 5)
        # The subscription's last invoice, paid late, finds it canceled: Free already, no refill.
        _send_signed(db, _invoice_paid_event("evt_late_invoice"))

    assert _ai_pools(db, billing) == (20 + 50, 50)
    assert (billing.plan_tier, billing.stripe_subscription_id) == ("free", None)


def test_an_invoice_of_an_older_subscription_leaves_the_plan_and_credits(db, sample_user):
    """The customer moved from sub_grow to sub_studio; sub_grow's invoice, active or canceled,
    must not move them back, end their plan, or give them Grow's allowance."""
    billing = _grow_customer_billing(db, sample_user)
    with _stripe_test_env(subscription=STUDIO_SUBSCRIPTION):
        _send_signed(db, _checkout_event(sample_user.id, "evt_studio", subscription="sub_studio"))
    _spend_ai_credits(db, billing, 100)
    before = _credit_balances(billing)

    for status in ("active", "canceled"):
        with _stripe_test_env(subscription={**GROW_SUBSCRIPTION, "status": status}) as env:
            _send_signed(db, _invoice_paid_event(f"evt_old_{status}"))
        db.refresh(billing)
        assert (billing.plan_tier, billing.stripe_subscription_id) == ("studio", "sub_studio")
        assert _credit_balances(billing) == before
        env.receipt.assert_called_once()


def test_an_invoice_with_no_subscription_grants_nothing(db, sample_user):
    billing = _grow_customer_billing(db, sample_user)
    _spend_ai_credits(db, billing, 5)
    before = _credit_balances(billing)

    with _stripe_test_env() as env:
        _send_signed(db, _invoice_paid_event("evt_one_off", subscription=None))

    db.refresh(billing)
    assert _credit_balances(billing) == before
    env.stripe.subscriptions.retrieve.assert_not_called()
    env.receipt.assert_called_once()
