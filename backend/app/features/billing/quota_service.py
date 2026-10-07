"""Quota balances, enforcement, and plan-gating helpers.

Each balance holds plan credits and bought ones (credit_pools.py): spending takes plan credits
first, a reset or plan change replaces only the plan credits, and a refund gives back what its
hold took from each. Every spend, hold, refund and reset is one UPDATE that works the pools out
in SQL, never a balance read here and written back.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import ColumnElement, case, or_, select, update
from sqlalchemy.orm import Session

from app.features.billing import credit_pools as pools
from app.features.billing.plans import PLAN_LABELS, PlanTier, get_batch_limits, get_quotas, normalize_tier
from app.models.billing import UserBilling
from app.models.render_job import RenderJob
from app.models.user import User
from app.schemas.billing import BoughtBalances, BulkUploadLimits, PlanFeatures, QuotaBalances, UserBillingSnapshot

# allowance_granted_for while Free's allowance is the last one the plan credits were set from.
FREE_ALLOWANCE = "free"


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
        allowance_granted_for=FREE_ALLOWANCE,
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
        bought_balances=BoughtBalances(
            model_credits=pools.bought_credits(billing, "model"),
            ai_image_credits=pools.bought_credits(billing, "ai"),
            render_credits=pools.bought_credits(billing, "render"),
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


def subscription_allowance_key(subscription_id: str | None, period_start: datetime | None, tier: PlanTier) -> str:
    """What a subscription's allowance is granted for: the subscription, the period's start and
    the plan (allowance_granted_for)."""
    start = period_start.isoformat() if period_start else "-"
    return f"{subscription_id or '-'}|{start}|{tier}"


def _grant_allowance(db: Session, billing_id: int, tier: PlanTier, key: str, *conditions: ColumnElement[bool]) -> bool:
    """Make `tier`'s allowance the plan credits and record it as granted for `key`, in one UPDATE,
    where `conditions` hold; bought credits stay, and the allowance generation counts one more
    only when it does. Whether it did. Not committed."""
    values = {
        **pools.allowance_values(tier),
        UserBilling.allowance_granted_for: key,
        UserBilling.updated_at: datetime.utcnow(),
    }
    granted = db.execute(
        update(UserBilling)
        .where(UserBilling.id == billing_id, *conditions)
        .values(values)
        .execution_options(synchronize_session=False)
    )
    return granted.rowcount == 1


def reset_allotments(db: Session, billing: UserBilling, tier: PlanTier) -> None:
    """Make `tier`'s allowance the plan credits now, whatever was granted before: an admin's
    reset, and Free's monthly one. Bought credits stay; the allowance generation counts one more,
    so holds made before refund no plan credits on top of it."""
    values = {**pools.allowance_values(tier), UserBilling.plan_tier: tier, UserBilling.updated_at: datetime.utcnow()}
    if tier == "free":
        values[UserBilling.allowance_granted_for] = FREE_ALLOWANCE
    db.execute(
        update(UserBilling).where(UserBilling.id == billing.id).values(values).execution_options(synchronize_session=False)
    )
    db.commit()


def set_subscription_period(
    db: Session,
    billing: UserBilling,
    *,
    tier: PlanTier,
    period_start: datetime | None,
    period_end: datetime | None,
    stripe_subscription_id: str | None,
) -> bool:
    """Move the account to a paid subscription's plan and billing period, granting the period's
    allowance once. A paid checkout and each invoice.paid both come here, and Stripe may send
    either again under a new event id, so the allowance is granted only when the subscription,
    the period's start or the plan differs from the last grant; the conditional UPDATE also
    keeps two deliveries at once from both granting it. Bought credits stay. Whether it granted."""
    key = subscription_allowance_key(stripe_subscription_id, period_start, tier)
    granted = _grant_allowance(db, billing.id, tier, key, UserBilling.allowance_granted_for.is_distinct_from(key))
    change_plan(
        db,
        billing,
        tier=tier,
        period_start=period_start,
        period_end=period_end,
        stripe_subscription_id=stripe_subscription_id,
    )
    return granted


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
    """End the paid plan: Free, with no subscription or period. The plan credits drop to Free's
    allowance as the account leaves its paid plan, once: ending a plan already ended leaves
    them. Bought credits stay."""
    on_a_paid_plan = or_(
        UserBilling.allowance_granted_for.is_distinct_from(FREE_ALLOWANCE), UserBilling.plan_tier != "free"
    )
    _grant_allowance(db, billing.id, "free", FREE_ALLOWANCE, on_a_paid_plan)
    change_plan(db, billing, tier="free", period_start=None, period_end=None, stripe_subscription_id=None)


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
    """Spend one AI image credit, plan credits first, in one conditional UPDATE, so two images
    made at once can't both have the last credit. Committed."""
    spent = db.execute(
        update(UserBilling)
        .where(UserBilling.id == billing.id, UserBilling.ai_image_credits_balance > 0)
        .values(
            ai_image_credits_balance=UserBilling.ai_image_credits_balance - 1,
            updated_at=datetime.utcnow(),
        )
        .execution_options(synchronize_session=False)
    )
    if spent.rowcount != 1:
        raise HTTPException(status_code=402, detail="No AI image credits remaining.")
    db.commit()


@dataclass(frozen=True)
class CreditHold:
    """What a hold took: the billing period it was held in (for the record), the allowance
    generation then, which a refund checks, and how many of the credits held were bought ones,
    which a refund gives back as bought."""

    period_start: datetime | None
    allowance_generation: int
    bought_model_credits: int = 0
    bought_render_credits: int = 0


def hold_render_credits(db: Session, user_id: int, credits: int) -> CreditHold:
    """Take `credits` out of the render balance for jobs about to queue, plan credits first, or
    402 when it is short.

    One conditional UPDATE, so two requests at once can't both spend the same credits; it also
    locks the billing row until the caller commits. Returns the billing period and allowance
    generation the credits were held in and how many were bought. Not committed: the caller
    commits the hold with the jobs it pays for, or rolls both back.
    """
    held = db.execute(
        update(UserBilling)
        .where(UserBilling.user_id == user_id, UserBilling.render_credits_balance >= credits)
        .values(
            render_credits_balance=UserBilling.render_credits_balance - credits,
            updated_at=datetime.utcnow(),
        )
        .returning(
            UserBilling.period_start,
            UserBilling.allowance_generation,
            UserBilling.render_credits_balance,
            UserBilling.bought_render_credits,
        )
        .execution_options(synchronize_session=False)
    ).first()
    if held is None:
        raise HTTPException(
            status_code=402,
            detail=f"Not enough render credits ({credits} needed). Upgrade your plan or buy a top-up.",
        )
    return CreditHold(
        held.period_start,
        held.allowance_generation,
        bought_render_credits=pools.taken_from_bought(held.bought_render_credits, held.render_credits_balance, credits),
    )


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
    """Give a failed or canceled job's held credits back, once, to the pools they came from.

    One conditional UPDATE moves the job from held to refunded, so only one caller refunds it;
    another adds the credits back (return_held_credits): the bought ones always, the plan ones
    unless an allowance has replaced the plan credits since the hold. Not committed.
    """
    released = db.execute(
        update(RenderJob)
        .where(RenderJob.id == job.id, RenderJob.credit_state == "held")
        .values(credit_state="refunded")
        .execution_options(synchronize_session=False)
    ).rowcount
    if released:
        return_held_credits(
            db,
            job.user_id,
            job.billing_allowance_generation,
            render_credits=job.credits,
            bought_render_credits=job.bought_credits,
        )


def hold_batch_credits(db: Session, user_id: int, model_credits: int, render_credits: int) -> CreditHold:
    """Take a batch's model and render credits out of the balances together, plan credits first,
    or 402 naming the shortfall.

    One conditional UPDATE, so two requests at once can't both spend the same credits; it also
    locks the billing row until the caller commits. Returns the billing period and allowance
    generation the credits were held in and how many of each were bought. Not committed: the
    caller commits the hold with the designs it pays for, or rolls both back.
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
        .returning(
            UserBilling.period_start,
            UserBilling.allowance_generation,
            UserBilling.model_credits_balance,
            UserBilling.bought_model_credits,
            UserBilling.render_credits_balance,
            UserBilling.bought_render_credits,
        )
        .execution_options(synchronize_session=False)
    ).first()
    if held is not None:
        return CreditHold(
            held.period_start,
            held.allowance_generation,
            bought_model_credits=pools.taken_from_bought(held.bought_model_credits, held.model_credits_balance, model_credits),
            bought_render_credits=pools.taken_from_bought(
                held.bought_render_credits, held.render_credits_balance, render_credits
            ),
        )
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
    db: Session,
    user_id: int,
    allowance_generation: int,
    *,
    model_credits: int = 0,
    render_credits: int = 0,
    bought_model_credits: int = 0,
    bought_render_credits: int = 0,
) -> None:
    """Give held credits back to the pools they came from, in one UPDATE. Of `model_credits` and
    `render_credits`, the bought ones always go back, as bought credits; the rest are plan credits
    and go back only while the account's allowance generation is still `allowance_generation`,
    the one they were held in. A grant or reset since has replaced the plan credits they came
    out of, and adding them would give the new allowance extra; a billing period that moved with
    no grant has not, so they go back. The caller makes sure it returns them once. Not committed."""
    if not model_credits and not render_credits:
        return
    same_allowance = UserBilling.allowance_generation == allowance_generation
    values = {UserBilling.updated_at: datetime.utcnow()}
    for kind, held, bought in (("model", model_credits, bought_model_credits), ("render", render_credits, bought_render_credits)):
        if held:
            plan = case((same_allowance, held - bought), else_=0)
            values.update(pools.credit_values(kind, plan=plan, bought=bought))
    db.execute(
        update(UserBilling)
        .where(UserBilling.user_id == user_id)
        .values(values)
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


def change_storage_bytes(db: Session, user_id: int, delta: int) -> None:
    """Count `delta` more bytes of the owner's storage, or fewer when it is negative (a file that
    replaces a larger one), never below zero; 402 when growing would pass the plan's limit.

    One conditional UPDATE, so the limit holds on the net change against everything counted
    already. Not committed: the caller commits it with the files it counts.
    """
    billing = db.execute(select(UserBilling).where(UserBilling.user_id == user_id)).scalars().first()
    storage_limit = get_quotas(normalize_tier(billing.plan_tier if billing else None)).storage_bytes
    used = UserBilling.storage_bytes_used
    stmt = update(UserBilling).where(UserBilling.user_id == user_id)
    if delta > 0:
        stmt = stmt.where(used <= storage_limit - delta)
    changed = db.execute(
        stmt.values(storage_bytes_used=case((used + delta > 0, used + delta), else_=0), updated_at=datetime.utcnow())
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
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


# What an admin adjustment of each kind changes.
_ADJUSTABLE = {
    "model": UserBilling.model_credits_balance,
    "ai": UserBilling.ai_image_credits_balance,
    "render": UserBilling.render_credits_balance,
    "custom_material": UserBilling.custom_material_credits_balance,
    "custom_asset": UserBilling.custom_asset_credits_balance,
    "storage": UserBilling.storage_bytes_used,
}


def _adjustment_values(kind: str, delta: int) -> dict:
    """SET values for an admin's adjustment. A grant adds plan credits, which the next reset
    replaces, as it always has; a deduction takes plan credits first and stops at zero."""
    if delta > 0 and kind in pools.BOUGHT_KINDS:
        return pools.credit_values(kind, plan=delta)
    column = _ADJUSTABLE[kind]
    return {column: case((column + delta > 0, column + delta), else_=0)}


def adjust_credits(
    db: Session,
    billing: UserBilling,
    *,
    kind: str,
    delta: int,
    admin_user_id: int,
    target_user_id: int,
    reason: str,
) -> None:
    """Apply a signed credit delta (model, ai, render, custom_material, custom_asset or storage)
    in one UPDATE, so a spend or top-up committing meanwhile is kept, and persist an audit row."""
    if delta == 0:
        raise HTTPException(status_code=400, detail="Adjustment delta cannot be zero")
    if kind not in _ADJUSTABLE:
        raise HTTPException(status_code=400, detail=f"Unknown credit kind: {kind}")

    db.execute(
        update(UserBilling)
        .where(UserBilling.id == billing.id)
        .values({**_adjustment_values(kind, delta), UserBilling.updated_at: datetime.utcnow()})
        .execution_options(synchronize_session=False)
    )
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
