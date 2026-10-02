"""Paid top-ups: the credits a purchase adds, recorded once per Stripe Checkout Session."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.billing import CreditPurchase, UserBilling


def _add_topup_credits(billing: UserBilling, *, kind: str, amount: int) -> None:
    if kind == "model":
        billing.model_credits_balance += amount
    elif kind == "ai":
        billing.ai_image_credits_balance += amount
    else:
        raise ValueError(f"Unknown top-up kind: {kind}")
    billing.updated_at = datetime.utcnow()


def _is_session_recorded(db: Session, session_id: str) -> bool:
    found = db.scalar(
        select(CreditPurchase.id).where(CreditPurchase.stripe_checkout_session_id == session_id)
    )
    return found is not None


def record_topup_purchase(
    db: Session,
    billing: UserBilling,
    *,
    kind: str,
    credits: int,
    session_id: str,
    event_id: str,
    amount_total: int | None,
    currency: str | None,
) -> bool:
    """Add a paid top-up's credits and its ledger row in one commit, once per Checkout Session.

    Returns False and changes nothing when the session is already recorded: a replayed
    webhook, or the same purchase arriving twice at once (the unique session id stops it).
    """
    if _is_session_recorded(db, session_id):
        return False
    _add_topup_credits(billing, kind=kind, amount=credits)
    db.add(
        CreditPurchase(
            user_id=billing.user_id,
            kind=kind,
            credits=credits,
            stripe_checkout_session_id=session_id,
            stripe_event_id=event_id,
            amount_total=amount_total,
            currency=currency,
            created_at=datetime.utcnow(),
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if _is_session_recorded(db, session_id):
            return False
        raise
    return True
