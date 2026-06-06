"""Admin ops service — users, credits, usage, support actions."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.features.admin import analytics as admin_analytics
from app.features.auth.service import _create_session
from app.features.billing.plans import normalize_tier
from app.features.billing.quota_service import (
    adjust_credits,
    get_or_create_billing,
    record_admin_action,
    reset_allotments,
    snapshot,
)
from app.models.billing import BillingEvent, UserBilling
from app.models.scene import Scene
from app.models.user import ContactMessage, Session as DbSession, User
from app.schemas.admin import (
    AdminAnalytics,
    AdminOverview,
    AdminUserDetail,
    AdminUserListResponse,
    AdminUserRow,
    BillingEventListResponse,
    BillingEventRow,
    ContactMessageListResponse,
    ContactMessageRow,
    CreditAdjustmentRow,
    ImpersonateResponse,
    TopUserRow,
)


def _scene_counts(db: Session, user_ids: list[int]) -> dict[int, int]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(Scene.user_id, func.count(Scene.id))
        .where(Scene.user_id.in_(user_ids))
        .group_by(Scene.user_id)
    ).all()
    return {user_id: count for user_id, count in rows}


def get_analytics(db: Session) -> AdminAnalytics:
    return admin_analytics.get_analytics(db)


def list_top_users(db: Session, *, limit: int = 10) -> list[TopUserRow]:
    return admin_analytics.list_top_users(db, limit=limit)


def get_overview(db: Session) -> AdminOverview:
    user_count = db.scalar(select(func.count(User.id))) or 0
    active_subscriptions = db.scalar(
        select(func.count(UserBilling.id)).where(UserBilling.stripe_subscription_id.isnot(None))
    ) or 0
    contact_unread_hint = db.scalar(select(func.count(ContactMessage.id))) or 0
    since = datetime.utcnow() - timedelta(days=7)
    recent_webhook_count = db.scalar(
        select(func.count(BillingEvent.id)).where(BillingEvent.processed_at >= since)
    ) or 0
    return AdminOverview(
        user_count=user_count,
        active_subscriptions=active_subscriptions,
        contact_unread_hint=contact_unread_hint,
        recent_webhook_count=recent_webhook_count,
    )


def list_users(
    db: Session,
    *,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AdminUserListResponse:
    filters = []
    if q:
        term = f"%{q.strip().lower()}%"
        filters.append(
            or_(
                func.lower(User.email).like(term),
                func.lower(func.coalesce(User.name, "")).like(term),
            )
        )

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    users = db.execute(
        select(User).where(*filters).order_by(User.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()
    user_ids = [u.id for u in users]

    billing_rows = {
        b.user_id: b
        for b in db.execute(
            select(UserBilling).where(UserBilling.user_id.in_(user_ids))
        ).scalars().all()
    }
    scene_counts = _scene_counts(db, user_ids)

    rows: list[AdminUserRow] = []
    for user in users:
        billing = billing_rows.get(user.id)
        if billing is None:
            billing = get_or_create_billing(db, user)
        rows.append(
            AdminUserRow(
                id=user.id,
                email=user.email,
                name=user.name,
                role=user.role,
                is_active=user.is_active,
                plan_tier=normalize_tier(billing.plan_tier),
                model_credits=billing.model_credits_balance,
                ai_image_credits=billing.ai_image_credits_balance,
                storage_bytes_used=billing.storage_bytes_used,
                scene_count=scene_counts.get(user.id, 0),
                created_at=user.created_at,
            )
        )

    return AdminUserListResponse(users=rows, total=total)


def _adjustment_rows(db: Session, user_id: int, limit: int = 20) -> list[CreditAdjustmentRow]:
    from app.models.billing import CreditAdjustment

    rows = db.execute(
        select(CreditAdjustment, User.email)
        .join(User, User.id == CreditAdjustment.admin_user_id)
        .where(CreditAdjustment.target_user_id == user_id)
        .order_by(CreditAdjustment.created_at.desc())
        .limit(limit)
    ).all()
    return [
        CreditAdjustmentRow(
            id=adj.id,
            admin_user_id=adj.admin_user_id,
            admin_email=admin_email,
            target_user_id=adj.target_user_id,
            kind=adj.kind,
            delta=adj.delta,
            reason=adj.reason,
            created_at=adj.created_at,
        )
        for adj, admin_email in rows
    ]


def get_user_detail(db: Session, user_id: int) -> AdminUserDetail:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    billing_snapshot = snapshot(db, user)
    scene_count = db.scalar(
        select(func.count(Scene.id)).where(Scene.user_id == user_id)
    ) or 0

    return AdminUserDetail(
        id=user.id,
        email=user.email,
        name=user.name,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        scene_count=scene_count,
        billing=billing_snapshot,
        usage=admin_analytics.get_user_usage(db, user_id),
        recent_adjustments=_adjustment_rows(db, user_id),
    )


def set_user_active(db: Session, user_id: int, *, is_active: bool, admin: User) -> AdminUserDetail:
    if user_id == admin.id and not is_active:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = is_active
    user.updated_at = datetime.utcnow()
    if not is_active:
        for session in db.scalars(select(DbSession).where(DbSession.user_id == user_id)).all():
            db.delete(session)
    db.commit()
    db.refresh(user)
    return get_user_detail(db, user_id)


def adjust_user_credits(
    db: Session,
    user_id: int,
    *,
    kind: str,
    delta: int,
    reason: str,
    admin: User,
) -> AdminUserDetail:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    billing = get_or_create_billing(db, user)
    adjust_credits(
        db,
        billing,
        kind=kind,
        delta=delta,
        admin_user_id=admin.id,
        target_user_id=user_id,
        reason=reason,
    )
    return get_user_detail(db, user_id)


def reset_user_allotments(
    db: Session,
    user_id: int,
    *,
    tier: str | None,
    admin: User,
) -> AdminUserDetail:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    billing = get_or_create_billing(db, user)
    target_tier = normalize_tier(tier or billing.plan_tier)
    reset_allotments(db, billing, target_tier)
    record_admin_action(
        db,
        admin_user_id=admin.id,
        target_user_id=user_id,
        kind="allotment_reset",
        delta=0,
        reason=f"Reset allotments to {target_tier} tier",
    )
    db.commit()
    return get_user_detail(db, user_id)


def list_billing_events(
    db: Session,
    *,
    limit: int = 50,
    offset: int = 0,
) -> BillingEventListResponse:
    total = db.scalar(select(func.count(BillingEvent.id))) or 0
    events = db.execute(
        select(BillingEvent).order_by(BillingEvent.processed_at.desc()).limit(limit).offset(offset)
    ).scalars().all()
    return BillingEventListResponse(
        events=[
            BillingEventRow(
                id=e.id,
                stripe_event_id=e.stripe_event_id,
                event_type=e.event_type,
                processed_at=e.processed_at,
            )
            for e in events
        ],
        total=total,
    )


def list_contact_messages(
    db: Session,
    *,
    limit: int = 50,
    offset: int = 0,
) -> ContactMessageListResponse:
    total = db.scalar(select(func.count(ContactMessage.id))) or 0
    messages = db.execute(
        select(ContactMessage)
        .order_by(ContactMessage.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()
    return ContactMessageListResponse(
        messages=[
            ContactMessageRow(
                id=m.id,
                name=m.name,
                email=m.email,
                message=m.message,
                created_at=m.created_at,
            )
            for m in messages
        ],
        total=total,
    )


def impersonate_user(db: Session, user_id: int, admin: User) -> ImpersonateResponse:
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Already signed in as this user")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Cannot impersonate a disabled user")

    token = _create_session(db, user)
    record_admin_action(
        db,
        admin_user_id=admin.id,
        target_user_id=user_id,
        kind="impersonate",
        delta=0,
        reason=f"Support impersonation by {admin.email}",
    )
    db.commit()
    return ImpersonateResponse(token=token, user_id=user.id, email=user.email)
