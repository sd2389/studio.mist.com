"""Quota balances, enforcement, and plan-gating helpers."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import case, select, update
from sqlalchemy.orm import Session

from app.features.billing.plans import (
    PLAN_LABELS,
    PLAN_QUOTAS,
    PlanTier,
    get_batch_limits,
    get_quotas,
    normalize_tier,
)
from app.models.billing import UserBilling
from app.models.render_job import RenderJob
from app.models.user import User
from app.schemas.billing import BulkUploadLimits, PlanFeatures, QuotaBalances, UserBillingSnapshot


def _apply_allotment(billing: UserBilling, tier: PlanTier) -> None:
    quotas = get_quotas(tier)
    billing.plan_tier = tier
    billing.model_credits_balance = quotas.model_credits
    billing.ai_image_credits_balance = quotas.ai_image_credits
    billing.render_credits_balance = quotas.render_credits
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
        render_credits_balance=quotas.render_credits,
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
    batches = get_batch_limits(tier)
    return PlanFeatures(
        max_variants_per_model=quotas.max_variants_per_model,
        max_image_resolution=quotas.max_image_resolution,
        max_polygons=quotas.max_polygons,
        watermark_exports=quotas.watermark_exports,
        embed_enabled=True,
        batch_export_enabled=quotas.batch_export,
        video_8k_enabled=quotas.max_8k_video_seconds > 0,
        campaign_pack_enabled=quotas.campaign_pack,
        bulk_upload=BulkUploadLimits(
            max_designs=batches.max_designs,
            max_bytes=batches.max_bytes,
            max_file_bytes=batches.max_file_bytes,
            max_open_batches=batches.max_open_batches,
        ),
        max_video_fps=quotas.max_video_fps,
        max_video_seconds=quotas.max_video_seconds,
        max_8k_video_seconds=quotas.max_8k_video_seconds,
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
            render_credits=billing.render_credits_balance,
            custom_material_credits=billing.custom_material_credits_balance,
            custom_asset_credits=billing.custom_asset_credits_balance,
            storage_bytes_used=billing.storage_bytes_used,
            storage_bytes_limit=quotas.storage_bytes,
        ),
        allotments=QuotaBalances(
            model_credits=quotas.model_credits,
            ai_image_credits=quotas.ai_image_credits,
            render_credits=quotas.render_credits,
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


def change_plan(
    db: Session,
    billing: UserBilling,
    *,
    tier: PlanTier,
    period_start: datetime | None,
    period_end: datetime | None,
    stripe_subscription_id: str | None,
) -> None:
    """Move the account to a plan and billing period. Credit balances stay as they are."""
    billing.plan_tier = tier
    billing.period_start = period_start
    billing.period_end = period_end
    billing.stripe_subscription_id = stripe_subscription_id
    billing.updated_at = datetime.utcnow()
    db.commit()


def downgrade_to_free(db: Session, billing: UserBilling) -> None:
    billing.stripe_subscription_id = None
    billing.period_start = None
    billing.period_end = None
    _apply_allotment(billing, "free")
    db.commit()


def assert_polygon_limit(db: Session, user: User, polygon_count: int) -> UserBilling:
    if polygon_count < 0:
        raise HTTPException(status_code=400, detail="polygon_count must be >= 0")
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    cap = get_quotas(tier).max_polygons
    if polygon_count > cap:
        raise HTTPException(
            status_code=402,
            detail=f"Polygon limit exceeded for {PLAN_LABELS[tier]} (max {cap:,}).",
        )
    return billing


def assert_variant_limit(db: Session, user: User, variant_count: int) -> UserBilling:
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    cap = get_quotas(tier).max_variants_per_model
    if variant_count > cap:
        raise HTTPException(
            status_code=402,
            detail=f"Variant limit reached for {PLAN_LABELS[tier]} (max {cap} per model).",
        )
    return billing


def assert_image_resolution(db: Session, user: User, width: int | None, height: int | None) -> int:
    """Either side above the plan's max_image_resolution is refused; an unknown side passes.

    Returns that cap (px per side).
    """
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    cap = get_quotas(tier).max_image_resolution
    if max(width or 0, height or 0) > cap:
        raise HTTPException(
            status_code=402,
            detail=f"Resolution limit exceeded for {PLAN_LABELS[tier]} (max {cap} px per side).",
        )
    return cap


def assert_model_credit(db: Session, user: User) -> UserBilling:
    billing = get_or_create_billing(db, user)
    if billing.model_credits_balance <= 0:
        raise HTTPException(
            status_code=402,
            detail="No model credits remaining. Upgrade your plan or purchase a top-up.",
        )
    return billing


def consume_model_credit(db: Session, billing: UserBilling, upload_bytes: int = 0) -> None:
    """Spend one model credit and count the model's `upload_bytes` of storage.

    One conditional UPDATE that also holds the plan's storage limit, so two saves racing for
    the last credit or the last bytes cannot both have them. Not committed: the caller
    commits it with the scene it pays for, or rolls both back.
    """
    storage_limit = get_quotas(normalize_tier(billing.plan_tier)).storage_bytes
    spent = db.execute(
        update(UserBilling)
        .where(
            UserBilling.id == billing.id,
            UserBilling.model_credits_balance > 0,
            UserBilling.storage_bytes_used <= storage_limit - upload_bytes,
        )
        .values(
            model_credits_balance=UserBilling.model_credits_balance - 1,
            storage_bytes_used=UserBilling.storage_bytes_used + upload_bytes,
            updated_at=datetime.utcnow(),
        )
    )
    if spent.rowcount != 1:
        db.refresh(billing)  # which limit the other save took
        if billing.model_credits_balance <= 0:
            raise HTTPException(status_code=402, detail="No model credits remaining.")
        raise HTTPException(
            status_code=402,
            detail="Storage limit reached. Upgrade your plan or delete unused models.",
        )


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


def hold_render_credits(db: Session, user_id: int, credits: int) -> datetime | None:
    """Take `credits` out of the render balance for jobs about to queue, or 402 when it is short.

    One conditional UPDATE, so two requests at once can't both spend the same credits; it also
    locks the billing row until the caller commits. Returns the billing period the credits were
    held in, which a refund checks. Not committed: the caller commits the hold with the jobs it
    pays for, or rolls both back.
    """
    held = db.execute(
        update(UserBilling)
        .where(UserBilling.user_id == user_id, UserBilling.render_credits_balance >= credits)
        .values(
            render_credits_balance=UserBilling.render_credits_balance - credits,
            updated_at=datetime.utcnow(),
        )
        .returning(UserBilling.period_start)
        .execution_options(synchronize_session=False)
    ).first()
    if held is None:
        raise HTTPException(
            status_code=402,
            detail=f"Not enough render credits ({credits} needed). Upgrade your plan or buy a top-up.",
        )
    return held.period_start


def charge_render_job(db: Session, job: RenderJob) -> None:
    """Keep a completed job's held credits; the balance doesn't move again.

    One conditional UPDATE from held to charged, so a job is charged once. Not committed.
    """
    db.execute(
        update(RenderJob)
        .where(RenderJob.id == job.id, RenderJob.credit_state == "held")
        .values(credit_state="charged")
        .execution_options(synchronize_session=False)
    )


def refund_render_job(db: Session, job: RenderJob) -> None:
    """Give a failed or canceled job's held credits back, once.

    One conditional UPDATE moves the job from held to refunded, so only one caller refunds it;
    another adds the credits back to the balance, unless the billing period has rolled over
    since the hold: the new period's allotment has replaced the balance they came out of, and
    adding them would give it extra. Not committed.
    """
    released = db.execute(
        update(RenderJob)
        .where(RenderJob.id == job.id, RenderJob.credit_state == "held")
        .values(credit_state="refunded")
        .execution_options(synchronize_session=False)
    ).rowcount
    if released:
        return_held_credits(db, job.user_id, job.billing_period_start, render_credits=job.credits)


def hold_batch_credits(db: Session, user_id: int, model_credits: int, render_credits: int) -> datetime | None:
    """Take a batch's model and render credits out of the balances together, or 402 naming the
    shortfall.

    One conditional UPDATE, so two requests at once can't both spend the same credits; it also
    locks the billing row until the caller commits. Returns the billing period the credits were
    held in, which a refund checks. Not committed: the caller commits the hold with the designs
    it pays for, or rolls both back.
    """
    held = db.execute(
        update(UserBilling)
        .where(
            UserBilling.user_id == user_id,
            UserBilling.model_credits_balance >= model_credits,
            UserBilling.render_credits_balance >= render_credits,
        )
        .values(
            model_credits_balance=UserBilling.model_credits_balance - model_credits,
            render_credits_balance=UserBilling.render_credits_balance - render_credits,
            updated_at=datetime.utcnow(),
        )
        .returning(UserBilling.period_start)
        .execution_options(synchronize_session=False)
    ).first()
    if held is not None:
        return held.period_start
    billing = db.execute(select(UserBilling).where(UserBilling.user_id == user_id)).scalars().first()
    model_left = billing.model_credits_balance if billing else 0
    render_left = billing.render_credits_balance if billing else 0
    raise HTTPException(
        status_code=402,
        detail=(
            f"This needs {model_credits} model credits and {render_credits} render credits; "
            f"{model_left} model credits and {render_left} render credits are left. "
            "Upgrade your plan or buy a top-up."
        ),
    )


def return_held_credits(
    db: Session, user_id: int, period_start: datetime | None, *, model_credits: int = 0, render_credits: int = 0
) -> None:
    """Add held credits back to the balances, unless the billing period has rolled over since
    they were held: the new period's allotment has replaced the balances they came out of, and
    adding them would give it extra. The caller makes sure it returns them once. Not committed."""
    if not model_credits and not render_credits:
        return
    db.execute(
        update(UserBilling)
        .where(UserBilling.user_id == user_id, UserBilling.period_start.is_not_distinct_from(period_start))
        .values(
            model_credits_balance=UserBilling.model_credits_balance + model_credits,
            render_credits_balance=UserBilling.render_credits_balance + render_credits,
            updated_at=datetime.utcnow(),
        )
        .execution_options(synchronize_session=False)
    )


def assert_custom_material_credit(db: Session, user: User) -> UserBilling:
    billing = get_or_create_billing(db, user)
    if billing.custom_material_credits_balance <= 0:
        raise HTTPException(
            status_code=402,
            detail="No custom material credits remaining. Upgrade your plan.",
        )
    return billing


def consume_custom_material_credit(db: Session, billing: UserBilling) -> None:
    """Spend one custom-material credit in one conditional UPDATE, so two saves racing for
    the last credit cannot both have it. Not committed: the caller commits it with the
    material it pays for, or rolls both back."""
    spent = db.execute(
        update(UserBilling)
        .where(UserBilling.id == billing.id, UserBilling.custom_material_credits_balance > 0)
        .values(
            custom_material_credits_balance=UserBilling.custom_material_credits_balance - 1,
            updated_at=datetime.utcnow(),
        )
    )
    if spent.rowcount != 1:
        raise HTTPException(status_code=402, detail="No custom material credits remaining.")


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
    """Spend one custom-asset credit and count the asset's `byte_size` of storage, in one
    conditional UPDATE that also holds the plan's storage limit, so two uploads racing for
    the last credit or the last bytes cannot both have them. Not committed: the caller
    commits it with the asset it pays for, or rolls both back."""
    storage_limit = get_quotas(normalize_tier(billing.plan_tier)).storage_bytes
    spent = db.execute(
        update(UserBilling)
        .where(
            UserBilling.id == billing.id,
            UserBilling.custom_asset_credits_balance > 0,
            UserBilling.storage_bytes_used <= storage_limit - byte_size,
        )
        .values(
            custom_asset_credits_balance=UserBilling.custom_asset_credits_balance - 1,
            storage_bytes_used=UserBilling.storage_bytes_used + byte_size,
            updated_at=datetime.utcnow(),
        )
    )
    if spent.rowcount != 1:
        db.refresh(billing)  # which limit the other upload took
        if billing.custom_asset_credits_balance <= 0:
            raise HTTPException(status_code=402, detail="No custom asset credits remaining.")
        raise HTTPException(status_code=402, detail="Storage limit reached.")


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


def count_storage_bytes(db: Session, user_id: int, byte_size: int) -> None:
    """Count `byte_size` more of the owner's storage, or 402 when it would pass the plan's limit.

    One conditional UPDATE that holds the limit, so two completions racing for the last bytes
    can't both have them. Not committed: the caller commits it with the files it counts.
    """
    billing = db.execute(select(UserBilling).where(UserBilling.user_id == user_id)).scalars().first()
    storage_limit = get_quotas(normalize_tier(billing.plan_tier if billing else None)).storage_bytes
    counted = db.execute(
        update(UserBilling)
        .where(UserBilling.user_id == user_id, UserBilling.storage_bytes_used <= storage_limit - byte_size)
        .values(
            storage_bytes_used=UserBilling.storage_bytes_used + byte_size,
            updated_at=datetime.utcnow(),
        )
        .execution_options(synchronize_session=False)
    )
    if counted.rowcount != 1:
        raise HTTPException(
            status_code=402,
            detail="Storage limit reached. Upgrade your plan or delete unused models.",
        )


def release_storage_bytes(db: Session, billing: UserBilling, byte_size: int) -> None:
    """Give back `byte_size` of storage, never below zero, in one UPDATE, so two deletes at once
    both count. Not committed: the caller commits it with what it deleted."""
    used = UserBilling.storage_bytes_used
    db.execute(
        update(UserBilling)
        .where(UserBilling.id == billing.id)
        .values(
            storage_bytes_used=case((used > byte_size, used - byte_size), else_=0),
            updated_at=datetime.utcnow(),
        )
    )


CreditKind = str  # model | ai | render | custom_material | custom_asset | storage


def _apply_credit_delta(billing: UserBilling, kind: CreditKind, delta: int) -> None:
    if kind == "model":
        billing.model_credits_balance = max(0, billing.model_credits_balance + delta)
    elif kind == "ai":
        billing.ai_image_credits_balance = max(0, billing.ai_image_credits_balance + delta)
    elif kind == "render":
        billing.render_credits_balance = max(0, billing.render_credits_balance + delta)
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
    if kind not in {"model", "ai", "render", "custom_material", "custom_asset", "storage"}:
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
