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
from app.features.billing.quota_service import (
    add_topup_credits,
    downgrade_to_free,
    get_or_create_billing,
    reset_allotments,
    set_subscription_period,
    tier_for_stripe_price,
)
from app.models.billing import BillingEvent, UserBilling
from app.models.user import User

logger = logging.getLogger(__name__)


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


def _subscription_price_id(subscription: object) -> str | None:
    items = _read_field(subscription, "items")
    data = _read_field(items, "data", []) if items is not None else []
    if not data:
        return None
    first = data[0]
    price = _read_field(first, "price")
    if price is None:
        return None
    value = _read_field(price, "id")
    return str(value) if value else None


def _apply_subscription(
    db: Session,
    billing: UserBilling,
    subscription: object,
) -> PlanTier:
    price_id = _subscription_price_id(subscription)
    tier = tier_for_stripe_price(price_id or "", _price_tier_map()) or "free"
    status = str(_read_field(subscription, "status", "") or "")
    if status in {"canceled", "unpaid", "incomplete_expired"}:
        downgrade_to_free(db, billing)
        return "free"

    set_subscription_period(
        db,
        billing,
        tier=tier,
        period_start=_ts_to_dt(_read_field(subscription, "current_period_start")),
        period_end=_ts_to_dt(_read_field(subscription, "current_period_end")),
        stripe_subscription_id=str(_read_field(subscription, "id") or "") or None,
    )
    return tier


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

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(db, data_obj)
    elif event_type in {"customer.subscription.created", "customer.subscription.updated"}:
        pair = _user_from_customer(db, _read_field(data_obj, "customer"))
        if pair:
            user, billing = pair
            tier = _apply_subscription(db, billing, data)
            billing_email.send_subscription_updated_email(
                to=user.email,
                plan_label=PLAN_LABELS[tier],
                action="updated",
            )
    elif event_type == "customer.subscription.deleted":
        pair = _user_from_customer(db, _read_field(data_obj, "customer"))
        if pair:
            user, billing = pair
            downgrade_to_free(db, billing)
            billing_email.send_subscription_updated_email(
                to=user.email,
                plan_label=PLAN_LABELS["free"],
                action="cancelled",
            )
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


def _handle_checkout_completed(db: Session, session: object) -> None:
    metadata = _read_field(session, "metadata") or {}
    if not isinstance(metadata, dict):
        metadata = dict(metadata) if metadata else {}
    user_id_raw = metadata.get("user_id")
    if not user_id_raw:
        return
    user = db.get(User, int(user_id_raw))
    if user is None:
        return
    billing = get_or_create_billing(db, user)

    if _read_field(session, "mode") == "payment":
        kind = metadata.get("topup_kind")
        credits_raw = metadata.get("topup_credits")
        if kind and credits_raw:
            add_topup_credits(db, billing, kind=str(kind), amount=int(credits_raw))
            billing_email.send_payment_receipt_email(
                to=user.email,
                plan_label=f"Top-up ({metadata.get('pack_id', kind)})",
                amount_label="one-time purchase",
            )
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
