"""Quota balances, enforcement, and plan-gating helpers."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.billing.plans import PLAN_LABELS, PLAN_QUOTAS, PlanTier, get_quotas, normalize_tier
from app.models.billing import UserBilling
from app.models.user import User
from app.schemas.billing import PlanFeatures, QuotaBalances, UserBillingSnapshot


def _apply_allotment(billing: UserBilling, tier: PlanTier) -> None:
    quotas = get_quotas(tier)
    billing.plan_tier = tier
    billing.model_credits_balance = quotas.model_credits
    billing.ai_image_credits_balance = quotas.ai_image_credits
    billing.custom_material_credits_balance = quotas.custom_material_credits
    billing.custom_asset_credits_balance = quotas.custom_asset_credits
    billing.updated_at = datetime.utcnow()


def get_or_create_billing(db: Session, user: User) -> UserBilling:
    billing = db.execute(
        select(UserBilling).where(UserBilling.user_id == user.id)
    ).scalars().first()
    if billing is not None:
        return billing

    now = datetime.utcnow()
    quotas = get_quotas("free")
    billing = UserBilling(
        user_id=user.id,
        plan_tier="free",
        model_credits_balance=quotas.model_credits,
        ai_image_credits_balance=quotas.ai_image_credits,
        custom_material_credits_balance=quotas.custom_material_credits,
        custom_asset_credits_balance=quotas.custom_asset_credits,
        storage_bytes_used=0,
        created_at=now,
        updated_at=now,
    )
    db.add(billing)
    db.commit()
    db.refresh(billing)
    return billing


def _features_for_tier(tier: PlanTier) -> PlanFeatures:
    quotas = get_quotas(tier)
    return PlanFeatures(
        max_variants_per_model=quotas.max_variants_per_model,
        max_image_resolution=quotas.max_image_resolution,
        watermark_exports=quotas.watermark_exports,
        embed_enabled=True,
        batch_export_enabled=tier != "free",
        video_8k_enabled=tier != "free",
    )


def snapshot(db: Session, user: User) -> UserBillingSnapshot:
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    quotas = get_quotas(tier)
    return UserBillingSnapshot(
        plan_tier=tier,
        plan_label=PLAN_LABELS[tier],
        period_start=billing.period_start,
        period_end=billing.period_end,
        balances=QuotaBalances(
            model_credits=billing.model_credits_balance,
            ai_image_credits=billing.ai_image_credits_balance,
            custom_material_credits=billing.custom_material_credits_balance,
            custom_asset_credits=billing.custom_asset_credits_balance,
            storage_bytes_used=billing.storage_bytes_used,
            storage_bytes_limit=quotas.storage_bytes,
        ),
        allotments=QuotaBalances(
            model_credits=quotas.model_credits,
            ai_image_credits=quotas.ai_image_credits,
            custom_material_credits=quotas.custom_material_credits,
            custom_asset_credits=quotas.custom_asset_credits,
            storage_bytes_used=0,
            storage_bytes_limit=quotas.storage_bytes,
        ),
        features=_features_for_tier(tier),
        stripe_customer_id=billing.stripe_customer_id,
        has_active_subscription=bool(billing.stripe_subscription_id),
    )


def reset_allotments(db: Session, billing: UserBilling, tier: PlanTier) -> None:
    _apply_allotment(billing, tier)
    db.commit()


def set_subscription_period(
    db: Session,
    billing: UserBilling,
    *,
    tier: PlanTier,
    period_start: datetime | None,
    period_end: datetime | None,
    stripe_subscription_id: str | None,
) -> None:
    billing.period_start = period_start
    billing.period_end = period_end
    billing.stripe_subscription_id = stripe_subscription_id
    _apply_allotment(billing, tier)
    db.commit()


def downgrade_to_free(db: Session, billing: UserBilling) -> None:
    billing.stripe_subscription_id = None
    billing.period_start = None
    billing.period_end = None
    _apply_allotment(billing, "free")
    db.commit()


def assert_model_credit(db: Session, user: User) -> UserBilling:
    billing = get_or_create_billing(db, user)
    if billing.model_credits_balance <= 0:
        raise HTTPException(
            status_code=402,
            detail="No model credits remaining. Upgrade your plan or purchase a top-up.",
        )
    return billing


def consume_model_credit(db: Session, billing: UserBilling) -> None:
    if billing.model_credits_balance <= 0:
        raise HTTPException(status_code=402, detail="No model credits remaining.")
    billing.model_credits_balance -= 1
    billing.updated_at = datetime.utcnow()
    db.commit()


def assert_ai_image_credit(db: Session, user: User) -> UserBilling:
    billing = get_or_create_billing(db, user)
    if billing.ai_image_credits_balance <= 0:
        raise HTTPException(
            status_code=402,
            detail="No AI image credits remaining. Upgrade your plan or purchase a top-up.",
        )
    return billing


def consume_ai_image_credit(db: Session, billing: UserBilling) -> None:
    if billing.ai_image_credits_balance <= 0:
        raise HTTPException(status_code=402, detail="No AI image credits remaining.")
    billing.ai_image_credits_balance -= 1
    billing.updated_at = datetime.utcnow()
    db.commit()


def assert_custom_material_credit(db: Session, user: User) -> UserBilling:
    billing = get_or_create_billing(db, user)
    if billing.custom_material_credits_balance <= 0:
        raise HTTPException(
            status_code=402,
            detail="No custom material credits remaining. Upgrade your plan.",
        )
    return billing


def consume_custom_material_credit(db: Session, billing: UserBilling) -> None:
    if billing.custom_material_credits_balance <= 0:
        raise HTTPException(status_code=402, detail="No custom material credits remaining.")
    billing.custom_material_credits_balance -= 1
    billing.updated_at = datetime.utcnow()
    db.commit()


def assert_custom_asset_credit(db: Session, user: User, byte_size: int) -> UserBilling:
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    quotas = get_quotas(tier)
    if billing.custom_asset_credits_balance <= 0:
        raise HTTPException(
            status_code=402,
            detail="No custom asset credits remaining. Upgrade your plan.",
        )
    if billing.storage_bytes_used + byte_size > quotas.storage_bytes:
        raise HTTPException(
            status_code=402,
            detail="Storage limit reached. Upgrade your plan or remove assets.",
        )
    return billing


def consume_custom_asset_credit(db: Session, billing: UserBilling, byte_size: int) -> None:
    tier = normalize_tier(billing.plan_tier)
    quotas = get_quotas(tier)
    if billing.custom_asset_credits_balance <= 0:
        raise HTTPException(status_code=402, detail="No custom asset credits remaining.")
    if billing.storage_bytes_used + byte_size > quotas.storage_bytes:
        raise HTTPException(status_code=402, detail="Storage limit reached.")
    billing.custom_asset_credits_balance -= 1
    billing.storage_bytes_used += byte_size
    billing.updated_at = datetime.utcnow()
    db.commit()


def assert_storage_for_upload(db: Session, user: User, byte_size: int) -> UserBilling:
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    quotas = get_quotas(tier)
    if billing.storage_bytes_used + byte_size > quotas.storage_bytes:
        raise HTTPException(
            status_code=402,
            detail="Storage limit reached. Upgrade your plan or delete unused models.",
        )
    return billing


def add_storage_bytes(db: Session, billing: UserBilling, byte_size: int) -> None:
    billing.storage_bytes_used += byte_size
    billing.updated_at = datetime.utcnow()
    db.commit()


def release_storage_bytes(db: Session, billing: UserBilling, byte_size: int) -> None:
    billing.storage_bytes_used = max(0, billing.storage_bytes_used - byte_size)
    billing.updated_at = datetime.utcnow()
    db.commit()


def add_topup_credits(
    db: Session,
    billing: UserBilling,
    *,
    kind: str,
    amount: int,
) -> None:
    if kind == "model":
        billing.model_credits_balance += amount
    elif kind == "ai":
        billing.ai_image_credits_balance += amount
    else:
        raise ValueError(f"Unknown top-up kind: {kind}")
    billing.updated_at = datetime.utcnow()
    db.commit()


CreditKind = str  # model | ai | custom_material | custom_asset | storage


def _apply_credit_delta(billing: UserBilling, kind: CreditKind, delta: int) -> None:
    if kind == "model":
        billing.model_credits_balance = max(0, billing.model_credits_balance + delta)
    elif kind == "ai":
        billing.ai_image_credits_balance = max(0, billing.ai_image_credits_balance + delta)
    elif kind == "custom_material":
        billing.custom_material_credits_balance = max(
            0, billing.custom_material_credits_balance + delta
        )
    elif kind == "custom_asset":
        billing.custom_asset_credits_balance = max(
            0, billing.custom_asset_credits_balance + delta
        )
    elif kind == "storage":
        billing.storage_bytes_used = max(0, billing.storage_bytes_used + delta)
    else:
        raise ValueError(f"Unknown credit kind: {kind}")


def adjust_credits(
    db: Session,
    billing: UserBilling,
    *,
    kind: CreditKind,
    delta: int,
    admin_user_id: int,
    target_user_id: int,
    reason: str,
) -> None:
    """Apply a signed credit delta and persist an audit row."""
    if delta == 0:
        raise HTTPException(status_code=400, detail="Adjustment delta cannot be zero")
    if kind not in {"model", "ai", "custom_material", "custom_asset", "storage"}:
        raise HTTPException(status_code=400, detail=f"Unknown credit kind: {kind}")

    _apply_credit_delta(billing, kind, delta)
    billing.updated_at = datetime.utcnow()
    record_admin_action(
        db,
        admin_user_id=admin_user_id,
        target_user_id=target_user_id,
        kind=kind,
        delta=delta,
        reason=reason,
    )
    db.commit()


def record_admin_action(
    db: Session,
    *,
    admin_user_id: int,
    target_user_id: int,
    kind: str,
    delta: int,
    reason: str,
) -> None:
    from app.models.billing import CreditAdjustment

    db.add(
        CreditAdjustment(
            admin_user_id=admin_user_id,
            target_user_id=target_user_id,
            kind=kind,
            delta=delta,
            reason=reason.strip(),
            created_at=datetime.utcnow(),
        )
    )


def refund_model_credit(db: Session, billing: UserBilling, *, admin_user_id: int, reason: str) -> None:
    adjust_credits(
        db,
        billing,
        kind="model",
        delta=1,
        admin_user_id=admin_user_id,
        target_user_id=billing.user_id,
        reason=reason,
    )


def refund_ai_image_credit(
    db: Session, billing: UserBilling, *, admin_user_id: int, reason: str
) -> None:
    adjust_credits(
        db,
        billing,
        kind="ai",
        delta=1,
        admin_user_id=admin_user_id,
        target_user_id=billing.user_id,
        reason=reason,
    )


def tier_for_stripe_price(price_id: str, price_map: dict[str, PlanTier]) -> PlanTier | None:
    return price_map.get(price_id)
