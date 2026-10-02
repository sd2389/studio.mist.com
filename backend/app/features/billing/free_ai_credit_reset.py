"""Lower old Free AI image credit balances to the Free allowance, keeping paid and granted credits.

Free accounts used to get 150 AI image credits; plans.py holds today's allowance. A Free
account above it keeps the allowance plus every AI credit it paid for (the purchase ledger
and Stripe Checkout) or an admin granted it, and never ends up above its current balance.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime

import stripe
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.billing.plans import get_quotas, normalize_tier
from app.features.billing.quota_service import record_admin_action
from app.features.billing.stripe_service import list_paid_topup_sessions
from app.models.billing import CreditAdjustment, CreditPurchase, UserBilling
from app.models.user import User

# Top-up packs (topup_kind) and admin adjustments (kind) both call AI image credits "ai".
AI_KIND = "ai"
AUDIT_KIND = "free_ai_allowance_reset"


@dataclass(frozen=True)
class AiCreditReset:
    """A Free account above the allowance: its AI image credits now and after the reset."""

    user_id: int
    plan_tier: str
    current: int
    paid: int
    granted: int
    new: int


def free_ai_allowance() -> int:
    return get_quotas("free").ai_image_credits


def require_admin(db: Session, user_id: int) -> User:
    """The active admin that audit rows are recorded under; ValueError for anyone else."""
    user = db.get(User, user_id)
    if user is None:
        raise ValueError(f"No user with id {user_id}.")
    if user.role != "admin" or not user.is_active:
        raise ValueError(f"User {user_id} is not an active admin.")
    return user


def plan_free_ai_reset(
    db: Session, stripe_client: stripe.StripeClient | None
) -> list[AiCreditReset]:
    """Every Free account above the allowance, with the balance it would keep. Writes nothing.

    Without a Stripe client, paid credits come from the purchase ledger alone.
    """
    allowance = free_ai_allowance()
    billings = _free_billings_above(db, allowance)
    user_ids = [billing.user_id for billing in billings]
    ledger = _ledger_ai_purchases(db, user_ids)
    grants = _admin_ai_grants(db, user_ids)
    resets = []
    for billing in billings:
        current = billing.ai_image_credits_balance
        paid = _paid_ai_credits(billing, ledger.get(billing.user_id, {}), stripe_client)
        granted = grants.get(billing.user_id, 0)
        resets.append(
            AiCreditReset(
                user_id=billing.user_id,
                plan_tier=billing.plan_tier,
                current=current,
                paid=paid,
                granted=granted,
                new=min(current, allowance + paid + granted),
            )
        )
    return resets


def apply_free_ai_reset(
    db: Session, resets: list[AiCreditReset], *, admin_user_id: int
) -> list[AiCreditReset]:
    """Lower the planned balances, with one credit_adjustments row each, in one commit.

    Each balance is read again under a row lock, so credits spent since the plan stay spent,
    and an account that has left Free or is now within its limit is left alone.
    Returns what was written.
    """
    require_admin(db, admin_user_id)
    allowance = free_ai_allowance()
    reason = f"Free AI allowance moved to {allowance}"
    applied = []
    for reset in resets:
        billing = _lock_billing(db, reset.user_id)
        if billing is None or normalize_tier(billing.plan_tier) != "free":
            continue
        current = billing.ai_image_credits_balance
        new = min(current, allowance + reset.paid + reset.granted)
        if new == current:
            continue
        billing.ai_image_credits_balance = new
        billing.updated_at = datetime.utcnow()
        record_admin_action(
            db,
            admin_user_id=admin_user_id,
            target_user_id=reset.user_id,
            kind=AUDIT_KIND,
            delta=new - current,
            reason=reason,
        )
        applied.append(replace(reset, current=current, new=new))
    db.commit()
    return applied


def _free_billings_above(db: Session, allowance: int) -> list[UserBilling]:
    billings = db.scalars(
        select(UserBilling)
        .where(UserBilling.ai_image_credits_balance > allowance)
        .order_by(UserBilling.user_id)
    ).all()
    return [billing for billing in billings if normalize_tier(billing.plan_tier) == "free"]


def _ledger_ai_purchases(db: Session, user_ids: list[int]) -> dict[int, dict[str, int]]:
    """Credits per Checkout Session of each user's AI top-ups in the purchase ledger."""
    rows = db.execute(
        select(
            CreditPurchase.user_id,
            CreditPurchase.stripe_checkout_session_id,
            CreditPurchase.credits,
        ).where(CreditPurchase.kind == AI_KIND, CreditPurchase.user_id.in_(user_ids))
    ).all()
    purchases: dict[int, dict[str, int]] = {}
    for user_id, session_id, credits in rows:
        purchases.setdefault(user_id, {})[session_id] = credits
    return purchases


def _admin_ai_grants(db: Session, user_ids: list[int]) -> dict[int, int]:
    """Each user's positive admin adjustments of AI credits (grants and refunds), summed."""
    rows = db.execute(
        select(CreditAdjustment.target_user_id, func.sum(CreditAdjustment.delta))
        .where(
            CreditAdjustment.kind == AI_KIND,
            CreditAdjustment.delta > 0,
            CreditAdjustment.target_user_id.in_(user_ids),
        )
        .group_by(CreditAdjustment.target_user_id)
    ).all()
    return {user_id: int(total) for user_id, total in rows}


def _paid_ai_credits(
    billing: UserBilling,
    ledger_sessions: dict[str, int],
    stripe_client: stripe.StripeClient | None,
) -> int:
    """AI top-up credits the account paid for: ledger sessions plus those only Stripe has."""
    sessions = dict(ledger_sessions)
    if stripe_client is not None and billing.stripe_customer_id:
        in_stripe = list_paid_topup_sessions(
            stripe_client, billing.stripe_customer_id, kind=AI_KIND
        )
        for session_id, credits in in_stripe.items():
            sessions.setdefault(session_id, credits)
    return sum(sessions.values())


def _lock_billing(db: Session, user_id: int) -> UserBilling | None:
    return db.scalars(
        select(UserBilling)
        .where(UserBilling.user_id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
