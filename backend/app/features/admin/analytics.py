"""Admin platform metrics — users, usage, revenue estimates."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.billing.plans import PLAN_LABELS, normalize_tier
from app.models.billing import BillingEvent, UserBilling
from app.models.render import Render
from app.models.scene import Scene
from app.models.user import ContactMessage, User
from app.schemas.admin import (
    AdminAnalytics,
    AdminRevenueStats,
    AdminUsageStats,
    AdminUserUsage,
    PlanTierCount,
    TopUserRow,
)

# Monthly list prices in cents (from pricing catalog).
_TIER_MRR_CENTS = {"grow": 4_900, "studio": 19_900}


def _since(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def _count_scenes(db: Session, *, since: datetime | None = None) -> int:
    filters = []
    if since is not None:
        filters.append(Scene.created_at >= since)
    return db.scalar(select(func.count(Scene.id)).where(*filters)) or 0


def _count_embedded_scenes(db: Session) -> int:
    return (
        db.scalar(
            select(func.count(Scene.id)).where(
                Scene.sku.isnot(None),
                func.trim(Scene.sku) != "",
            )
        )
        or 0
    )


def _count_renders(db: Session, *, since: datetime | None = None) -> int:
    filters = []
    if since is not None:
        filters.append(Render.created_at >= since)
    return db.scalar(select(func.count(Render.id)).where(*filters)) or 0


def _total_storage_bytes(db: Session) -> int:
    return db.scalar(select(func.coalesce(func.sum(UserBilling.storage_bytes_used), 0))) or 0


def _tier_counts(db: Session) -> list[PlanTierCount]:
    rows = db.execute(
        select(UserBilling.plan_tier, func.count(UserBilling.id)).group_by(UserBilling.plan_tier)
    ).all()
    counts = {normalize_tier(tier): count for tier, count in rows}
    return [
        PlanTierCount(
            tier=tier,
            label=PLAN_LABELS[tier],
            count=counts.get(tier, 0),
        )
        for tier in ("free", "grow", "studio")
    ]


def _active_subscription_counts(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(UserBilling.plan_tier, func.count(UserBilling.id))
        .where(UserBilling.stripe_subscription_id.isnot(None))
        .group_by(UserBilling.plan_tier)
    ).all()
    return {normalize_tier(tier): count for tier, count in rows}


def get_usage_stats(db: Session) -> AdminUsageStats:
    total_users = db.scalar(select(func.count(User.id))) or 0
    active_users = db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0
    return AdminUsageStats(
        total_users=total_users,
        active_users=active_users,
        new_users_7d=db.scalar(
            select(func.count(User.id)).where(User.created_at >= _since(7))
        )
        or 0,
        new_users_30d=db.scalar(
            select(func.count(User.id)).where(User.created_at >= _since(30))
        )
        or 0,
        total_cad_models=_count_scenes(db),
        cad_models_7d=_count_scenes(db, since=_since(7)),
        cad_models_30d=_count_scenes(db, since=_since(30)),
        total_embedded=_count_embedded_scenes(db),
        total_renders=_count_renders(db),
        renders_7d=_count_renders(db, since=_since(7)),
        renders_30d=_count_renders(db, since=_since(30)),
        total_storage_bytes=_total_storage_bytes(db),
        users_by_tier=_tier_counts(db),
    )


def get_revenue_stats(db: Session) -> AdminRevenueStats:
    sub_counts = _active_subscription_counts(db)
    grow_subs = sub_counts.get("grow", 0)
    studio_subs = sub_counts.get("studio", 0)
    estimated_mrr_cents = (
        grow_subs * _TIER_MRR_CENTS["grow"] + studio_subs * _TIER_MRR_CENTS["studio"]
    )

    since_30d = _since(30)
    paid_events_30d = (
        db.scalar(
            select(func.count(BillingEvent.id)).where(
                BillingEvent.event_type == "invoice.paid",
                BillingEvent.processed_at >= since_30d,
            )
        )
        or 0
    )
    checkout_events_30d = (
        db.scalar(
            select(func.count(BillingEvent.id)).where(
                BillingEvent.event_type == "checkout.session.completed",
                BillingEvent.processed_at >= since_30d,
            )
        )
        or 0
    )

    return AdminRevenueStats(
        active_subscriptions=grow_subs + studio_subs,
        grow_subscriptions=grow_subs,
        studio_subscriptions=studio_subs,
        estimated_mrr_cents=estimated_mrr_cents,
        invoice_paid_events_30d=paid_events_30d,
        checkout_completed_30d=checkout_events_30d,
        stripe_configured=bool(_stripe_configured()),
    )


def _stripe_configured() -> bool:
    from app.config import get_settings

    return bool(get_settings().stripe_secret_key)


def get_analytics(db: Session) -> AdminAnalytics:
    since_7d = _since(7)
    contact_unread_hint = db.scalar(select(func.count(ContactMessage.id))) or 0
    recent_webhook_count = (
        db.scalar(
            select(func.count(BillingEvent.id)).where(BillingEvent.processed_at >= since_7d)
        )
        or 0
    )
    return AdminAnalytics(
        usage=get_usage_stats(db),
        revenue=get_revenue_stats(db),
        contact_unread_hint=contact_unread_hint,
        recent_webhook_count=recent_webhook_count,
    )


def get_user_usage(db: Session, user_id: int) -> AdminUserUsage:
    from app.features.billing.quota_service import get_or_create_billing
    from app.features.billing.plans import get_quotas

    user = db.get(User, user_id)
    if user is None:
        raise ValueError("User not found")

    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    quotas = get_quotas(tier)
    scene_count = (
        db.scalar(select(func.count(Scene.id)).where(Scene.user_id == user_id)) or 0
    )
    embedded_count = (
        db.scalar(
            select(func.count(Scene.id)).where(
                Scene.user_id == user_id,
                Scene.sku.isnot(None),
                func.trim(Scene.sku) != "",
            )
        )
        or 0
    )
    render_count = (
        db.scalar(
            select(func.count(Render.id))
            .join(Scene, Scene.id == Render.scene_id)
            .where(Scene.user_id == user_id)
        )
        or 0
    )
    last_scene_at = db.scalar(
        select(func.max(Scene.updated_at)).where(Scene.user_id == user_id)
    )
    last_render_at = db.scalar(
        select(func.max(Render.created_at))
        .join(Scene, Scene.id == Render.scene_id)
        .where(Scene.user_id == user_id)
    )

    return AdminUserUsage(
        scene_count=scene_count,
        embedded_count=embedded_count,
        render_count=render_count,
        storage_bytes_used=billing.storage_bytes_used,
        model_credits_remaining=billing.model_credits_balance,
        ai_credits_remaining=billing.ai_image_credits_balance,
        model_credits_allotment=quotas.model_credits,
        ai_credits_allotment=quotas.ai_image_credits,
        last_scene_at=last_scene_at,
        last_render_at=last_render_at,
        has_active_subscription=bool(billing.stripe_subscription_id),
        plan_tier=tier,
        plan_label=PLAN_LABELS[tier],
    )


def list_top_users(db: Session, *, limit: int = 10) -> list[TopUserRow]:
    scene_counts = dict(
        db.execute(
            select(Scene.user_id, func.count(Scene.id)).group_by(Scene.user_id)
        ).all()
    )
    render_counts = dict(
        db.execute(
            select(Scene.user_id, func.count(Render.id))
            .join(Scene, Scene.id == Render.scene_id)
            .group_by(Scene.user_id)
        ).all()
    )
    billing_rows = {
        b.user_id: b
        for b in db.scalars(select(UserBilling)).all()
    }
    users = db.scalars(select(User).order_by(User.created_at.desc()).limit(200)).all()

    ranked: list[TopUserRow] = []
    for user in users:
        billing = billing_rows.get(user.id)
        ranked.append(
            TopUserRow(
                id=user.id,
                email=user.email,
                name=user.name,
                plan_tier=normalize_tier(billing.plan_tier if billing else "free"),
                scene_count=scene_counts.get(user.id, 0),
                render_count=render_counts.get(user.id, 0),
                storage_bytes_used=billing.storage_bytes_used if billing else 0,
                is_active=user.is_active,
            )
        )

    ranked.sort(key=lambda row: (row.scene_count, row.render_count), reverse=True)
    return ranked[:limit]
