"""Stripe Checkout, Customer Portal, and webhook dispatch."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.features.billing import email_service as billing_email
from app.features.billing.plans import PLAN_LABELS, TOP_UP_PACKS, PlanTier, normalize_tier
from app.features.billing.purchases import record_topup_purchase
from app.features.billing.quota_service import (
    change_plan,
    downgrade_to_free,
    get_or_create_billing,
    reset_allotments,
    set_subscription_period,
    tier_for_stripe_price,
)
from app.models.billing import BillingEvent, UserBilling
from app.models.user import User

logger = logging.getLogger(__name__)

# Subscription statuses that end the plan.
_ENDED_STATUSES = frozenset({"canceled", "unpaid", "incomplete_expired"})


def _stripe_client() -> stripe.StripeClient:
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=503,
            detail="Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env.",
        )
    return stripe.StripeClient(settings.stripe_secret_key)


def _price_tier_map() -> dict[str, PlanTier]:
    settings = get_settings()
    mapping: dict[str, PlanTier] = {}
    if settings.stripe_price_grow:
        mapping[settings.stripe_price_grow] = "grow"
    if settings.stripe_price_studio:
        mapping[settings.stripe_price_studio] = "studio"
    return mapping


def _topup_price_map() -> dict[str, str]:
    settings = get_settings()
    mapping: dict[str, str] = {}
    if settings.stripe_price_topup_model_10:
        mapping["model_10"] = settings.stripe_price_topup_model_10
    if settings.stripe_price_topup_model_25:
        mapping["model_25"] = settings.stripe_price_topup_model_25
    if settings.stripe_price_topup_ai_50:
        mapping["ai_50"] = settings.stripe_price_topup_ai_50
    if settings.stripe_price_topup_ai_150:
        mapping["ai_150"] = settings.stripe_price_topup_ai_150
    return mapping


def ensure_stripe_customer(db: Session, user: User, billing: UserBilling) -> str:
    if billing.stripe_customer_id:
        return billing.stripe_customer_id

    client = _stripe_client()
    customer = client.customers.create(
        params={
            "email": user.email,
            "name": user.name or user.email,
            "metadata": {"user_id": str(user.id)},
        }
    )
    billing.stripe_customer_id = customer.id
    billing.updated_at = datetime.utcnow()
    db.commit()
    return customer.id


def create_subscription_checkout(db: Session, user: User, price_id: str) -> str:
    tier = tier_for_stripe_price(price_id, _price_tier_map())
    if tier is None:
        raise HTTPException(status_code=400, detail="Unknown subscription price")

    billing = get_or_create_billing(db, user)
    customer_id = ensure_stripe_customer(db, user, billing)
    settings = get_settings()
    base = settings.app_public_url.rstrip("/")
    client = _stripe_client()

    session = client.checkout.sessions.create(
        params={
            "mode": "subscription",
            "customer": customer_id,
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": f"{base}/profile?checkout=success",
            "cancel_url": f"{base}/pricing?checkout=cancelled",
            "metadata": {"user_id": str(user.id), "plan_tier": tier},
        }
    )
    if not session.url:
        raise HTTPException(status_code=500, detail="Stripe did not return a checkout URL")
    return session.url


def create_topup_checkout(db: Session, user: User, pack_id: str) -> str:
    pack = TOP_UP_PACKS.get(pack_id)
    price_id = _topup_price_map().get(pack_id)
    if pack is None or not price_id:
        raise HTTPException(status_code=400, detail="Unknown top-up pack")

    billing = get_or_create_billing(db, user)
    customer_id = ensure_stripe_customer(db, user, billing)
    settings = get_settings()
    base = settings.app_public_url.rstrip("/")
    client = _stripe_client()

    session = client.checkout.sessions.create(
        params={
            "mode": "payment",
            "customer": customer_id,
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": f"{base}/profile?topup=success",
            "cancel_url": f"{base}/pricing?topup=cancelled",
            "metadata": {
                "user_id": str(user.id),
                "pack_id": pack_id,
                "topup_kind": str(pack["kind"]),
                "topup_credits": str(pack["credits"]),
            },
        }
    )
    if not session.url:
        raise HTTPException(status_code=500, detail="Stripe did not return a checkout URL")
    return session.url


def create_portal_session(db: Session, user: User) -> str:
    billing = get_or_create_billing(db, user)
    if not billing.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account yet. Subscribe to a plan first.")

    settings = get_settings()
    base = settings.app_public_url.rstrip("/")
    client = _stripe_client()
    session = client.billing_portal.sessions.create(
        params={
            "customer": billing.stripe_customer_id,
            "return_url": f"{base}/profile",
        }
    )
    if not session.url:
        raise HTTPException(status_code=500, detail="Stripe did not return a portal URL")
    return session.url


def list_paid_topup_sessions(
    client: stripe.StripeClient, customer_id: str, *, kind: str
) -> dict[str, int]:
    """Credits per paid top-up Checkout Session of one kind for a customer, across all pages."""
    sessions = client.v1.checkout.sessions.list(
        params={"customer": customer_id, "status": "complete", "limit": 100}
    )
    credits_by_session: dict[str, int] = {}
    for session in sessions.auto_paging_iter():
        metadata = _read_metadata(session)
        if _read_field(session, "payment_status") == "paid" and metadata.get("topup_kind") == kind:
            session_id = str(_read_field(session, "id"))
            credits_by_session[session_id] = int(metadata.get("topup_credits") or 0)
    return credits_by_session


def _is_event_processed(db: Session, event_id: str) -> bool:
    existing = db.execute(
        select(BillingEvent).where(BillingEvent.stripe_event_id == event_id)
    ).scalars().first()
    return existing is not None


def _record_event(db: Session, event_id: str, event_type: str) -> bool:
    if _is_event_processed(db, event_id):
        return False
    db.add(
        BillingEvent(
            stripe_event_id=event_id,
            event_type=event_type,
            processed_at=datetime.utcnow(),
        )
    )
    db.commit()
    return True


def _user_from_customer(db: Session, customer_id: str | None) -> tuple[User, UserBilling] | None:
    if not customer_id:
        return None
    billing = db.execute(
        select(UserBilling).where(UserBilling.stripe_customer_id == customer_id)
    ).scalars().first()
    if billing is None:
        return None
    user = db.get(User, billing.user_id)
    if user is None:
        return None
    return user, billing


def _ts_to_dt(ts: int | None) -> datetime | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)


def _read_field(obj: object, key: str, default: object = None) -> object:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _read_metadata(obj: object) -> dict[str, str]:
    """An object's metadata as a plain dict. StripeObject is not a dict: dict() on it raises."""
    metadata = _read_field(obj, "metadata")
    if isinstance(metadata, dict):
        return metadata
    if isinstance(metadata, stripe.StripeObject):
        return metadata.to_dict()
    return {}


def _first_subscription_item(subscription: object) -> object | None:
    items = _read_field(subscription, "items")
    data = _read_field(items, "data", []) if items is not None else []
    return data[0] if data else None


def _subscription_price_id(subscription: object) -> str | None:
    first = _first_subscription_item(subscription)
    price = _read_field(first, "price") if first is not None else None
    if price is None:
        return None
    value = _read_field(price, "id")
    return str(value) if value else None


def _subscription_tier(subscription: object) -> PlanTier:
    price_id = _subscription_price_id(subscription)
    return tier_for_stripe_price(price_id or "", _price_tier_map()) or "free"


def _subscription_period(subscription: object, key: str) -> datetime | None:
    """current_period_start or current_period_end. From API version 2025-03-31.basil
    Stripe sends them on the subscription items, not on the subscription."""
    value = _read_field(subscription, key)
    if value is None:
        first = _first_subscription_item(subscription)
        value = _read_field(first, key) if first is not None else None
    return _ts_to_dt(value)


def _apply_subscription(
    db: Session,
    billing: UserBilling,
    subscription: object,
) -> PlanTier:
    status = str(_read_field(subscription, "status", "") or "")
    if status in _ENDED_STATUSES:
        downgrade_to_free(db, billing)
        return "free"

    tier = _subscription_tier(subscription)
    set_subscription_period(
        db,
        billing,
        tier=tier,
        period_start=_subscription_period(subscription, "current_period_start"),
        period_end=_subscription_period(subscription, "current_period_end"),
        stripe_subscription_id=str(_read_field(subscription, "id") or "") or None,
    )
    return tier


def _is_current_subscription(billing: UserBilling, subscription: object) -> bool:
    """True when the account's plan comes from this subscription."""
    current_id = billing.stripe_subscription_id
    return current_id is not None and current_id == _read_field(subscription, "id")


def _change_or_end_plan(db: Session, billing: UserBilling, subscription: object) -> PlanTier | None:
    """Follow customer.subscription.created or .updated: change the plan or end it, never add
    credits. Credits come with a payment: a paid checkout or invoice.paid. Returns the plan
    the account is now on, or None when the event leaves the account alone."""
    status = str(_read_field(subscription, "status", "") or "")
    if status in _ENDED_STATUSES:
        if not _is_current_subscription(billing, subscription):
            return None
        downgrade_to_free(db, billing)
        return "free"
    if status == "incomplete":  # the first payment has not cleared
        return None
    if billing.stripe_subscription_id and not _is_current_subscription(billing, subscription):
        return None  # the account is on another subscription
    tier = _subscription_tier(subscription)
    change_plan(
        db,
        billing,
        tier=tier,
        period_start=_subscription_period(subscription, "current_period_start"),
        period_end=_subscription_period(subscription, "current_period_end"),
        stripe_subscription_id=str(_read_field(subscription, "id") or "") or None,
    )
    return tier


def _handle_subscription_changed(db: Session, subscription: object) -> None:
    """Stripe also sends customer.subscription.updated for renewals, card changes and cancel
    toggles, so the customer is emailed only when the plan itself changes."""
    pair = _user_from_customer(db, _read_field(subscription, "customer"))
    if pair is None:
        return
    user, billing = pair
    previous_tier = normalize_tier(billing.plan_tier)
    tier = _change_or_end_plan(db, billing, subscription)
    if tier is not None and tier != previous_tier:
        billing_email.send_subscription_updated_email(
            to=user.email,
            plan_label=PLAN_LABELS[tier],
            action="updated",
        )


def _handle_subscription_deleted(db: Session, subscription: object) -> None:
    pair = _user_from_customer(db, _read_field(subscription, "customer"))
    if pair is None:
        return
    user, billing = pair
    if not _is_current_subscription(billing, subscription):
        return  # an older subscription; the account has moved on from it
    downgrade_to_free(db, billing)
    billing_email.send_subscription_updated_email(
        to=user.email,
        plan_label=PLAN_LABELS["free"],
        action="cancelled",
    )


def handle_webhook(db: Session, payload: bytes, signature: str | None) -> dict[str, str]:
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(
            payload, signature, settings.stripe_webhook_secret
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc
    except stripe.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from exc

    event_id = str(_read_field(event, "id", ""))
    event_type = str(_read_field(event, "type", ""))
    if _is_event_processed(db, event_id):
        return {"status": "already_processed"}

    data_obj = _read_field(_read_field(event, "data"), "object")

    if event_type in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
        _handle_checkout_completed(db, data_obj, event_id)
    elif event_type == "checkout.session.async_payment_failed":
        _log_failed_async_payment(data_obj)
    elif event_type in {"customer.subscription.created", "customer.subscription.updated"}:
        _handle_subscription_changed(db, data_obj)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(db, data_obj)
    elif event_type == "invoice.paid":
        pair = _user_from_customer(db, _read_field(data_obj, "customer"))
        if pair:
            user, billing = pair
            sub_id = _read_field(data_obj, "subscription")
            if sub_id:
                client = _stripe_client()
                subscription = client.subscriptions.retrieve(str(sub_id))
                tier = _apply_subscription(db, billing, subscription)
            else:
                tier = normalize_tier(billing.plan_tier)
                reset_allotments(db, billing, tier)
            amount = int(_read_field(data_obj, "amount_paid", 0) or 0)
            amount_label = f"${amount / 100:.2f}" if amount else "your plan"
            billing_email.send_payment_receipt_email(
                to=user.email,
                plan_label=PLAN_LABELS[tier],
                amount_label=amount_label,
                invoice_url=_read_field(data_obj, "hosted_invoice_url"),
            )

    _record_event(db, event_id, event_type)
    logger.info("Processed Stripe event %s (%s)", event_id, event_type)
    return {"status": "ok"}


def _handle_checkout_completed(db: Session, session: object, event_id: str) -> None:
    """checkout.session.completed, and async_payment_succeeded for delayed payment methods.

    Nothing is granted until the session is paid. A delayed method (a bank debit, say)
    completes the checkout unpaid; async_payment_succeeded brings the same session back
    paid, and only then are top-up credits added or the plan started.
    """
    metadata = _read_metadata(session)
    user_id_raw = metadata.get("user_id")
    if not user_id_raw:
        return
    payment_status = _read_field(session, "payment_status")
    if payment_status != "paid":
        logger.info(
            "Checkout session %s for user %s is %s; nothing granted until it is paid",
            _read_field(session, "id"),
            user_id_raw,
            payment_status,
        )
        return
    user = db.get(User, int(user_id_raw))
    if user is None:
        return
    billing = get_or_create_billing(db, user)

    if _read_field(session, "mode") == "payment":
        _grant_topup(db, user, billing, session, metadata, event_id)
        return

    subscription_id = _read_field(session, "subscription")
    if not subscription_id:
        return
    client = _stripe_client()
    subscription = client.subscriptions.retrieve(subscription_id)
    tier = _apply_subscription(db, billing, subscription)
    billing_email.send_subscription_updated_email(
        to=user.email,
        plan_label=PLAN_LABELS[tier],
        action="activated",
    )


def _log_failed_async_payment(session: object) -> None:
    logger.warning(
        "Checkout session %s for user %s: the delayed payment failed; nothing granted",
        _read_field(session, "id"),
        _read_metadata(session).get("user_id"),
    )


def _grant_topup(
    db: Session,
    user: User,
    billing: UserBilling,
    session: object,
    metadata: dict[str, str],
    event_id: str,
) -> None:
    """Add a paid top-up, recorded in the purchase ledger, once per Checkout Session."""
    kind = metadata.get("topup_kind")
    credits_raw = metadata.get("topup_credits")
    if not kind or not credits_raw:
        return
    session_id = str(_read_field(session, "id") or "")
    if not session_id:
        logger.error("Top-up checkout in event %s has no session id; no credits added", event_id)
        return
    amount_total = _read_field(session, "amount_total")
    currency = _read_field(session, "currency")
    added = record_topup_purchase(
        db,
        billing,
        kind=str(kind),
        credits=int(credits_raw),
        session_id=session_id,
        event_id=event_id,
        amount_total=int(amount_total) if amount_total is not None else None,
        currency=str(currency) if currency else None,
    )
    if not added:
        logger.info("Checkout session %s already added its top-up", session_id)
        return
    billing_email.send_payment_receipt_email(
        to=user.email,
        plan_label=f"Top-up ({metadata.get('pack_id', kind)})",
        amount_label="one-time purchase",
    )
