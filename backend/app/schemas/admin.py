from datetime import datetime

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.billing import QuotaBalances, UserBillingSnapshot


class AdminUserRow(BaseModel):
    id: int
    email: str
    name: str | None
    role: str
    is_active: bool
    plan_tier: str
    model_credits: int
    ai_image_credits: int
    storage_bytes_used: int
    scene_count: int
    created_at: datetime


class AdminUserListResponse(BaseModel):
    users: list[AdminUserRow]
    total: int


class CreditAdjustmentRow(BaseModel):
    id: int
    admin_user_id: int
    admin_email: str
    target_user_id: int
    kind: str
    delta: int
    reason: str
    created_at: datetime


class AdminUserUsage(BaseModel):
    scene_count: int
    embedded_count: int
    render_count: int
    storage_bytes_used: int
    model_credits_remaining: int
    ai_credits_remaining: int
    model_credits_allotment: int
    ai_credits_allotment: int
    last_scene_at: datetime | None
    last_render_at: datetime | None
    has_active_subscription: bool
    plan_tier: str
    plan_label: str


class AdminUserDetail(BaseModel):
    id: int
    email: str
    name: str | None
    phone: str | None
    role: str
    is_active: bool
    created_at: datetime
    scene_count: int
    billing: UserBillingSnapshot
    usage: AdminUserUsage
    recent_adjustments: list[CreditAdjustmentRow]


class SetActiveRequest(BaseModel):
    is_active: bool


class CreditAdjustRequest(BaseModel):
    kind: Literal["model", "ai", "custom_material", "custom_asset", "storage"]
    delta: int = Field(ge=-10_000, le=10_000)
    reason: str = Field(min_length=3, max_length=512)


class ResetAllotmentsRequest(BaseModel):
    tier: Literal["free", "grow", "studio"] | None = None


class BillingEventRow(BaseModel):
    id: int
    stripe_event_id: str
    event_type: str
    processed_at: datetime


class BillingEventListResponse(BaseModel):
    events: list[BillingEventRow]
    total: int


class ContactMessageRow(BaseModel):
    id: int
    name: str
    email: str
    message: str
    created_at: datetime


class ContactMessageListResponse(BaseModel):
    messages: list[ContactMessageRow]
    total: int


class PlanTierCount(BaseModel):
    tier: str
    label: str
    count: int


class AdminUsageStats(BaseModel):
    total_users: int
    active_users: int
    new_users_7d: int
    new_users_30d: int
    total_cad_models: int
    cad_models_7d: int
    cad_models_30d: int
    total_embedded: int
    total_renders: int
    renders_7d: int
    renders_30d: int
    total_storage_bytes: int
    users_by_tier: list[PlanTierCount]


class AdminRevenueStats(BaseModel):
    active_subscriptions: int
    grow_subscriptions: int
    studio_subscriptions: int
    estimated_mrr_cents: int
    invoice_paid_events_30d: int
    checkout_completed_30d: int
    stripe_configured: bool


class AdminAnalytics(BaseModel):
    usage: AdminUsageStats
    revenue: AdminRevenueStats
    contact_unread_hint: int
    recent_webhook_count: int


class TopUserRow(BaseModel):
    id: int
    email: str
    name: str | None
    plan_tier: str
    scene_count: int
    render_count: int
    storage_bytes_used: int
    is_active: bool


class AdminOverview(BaseModel):
    user_count: int
    active_subscriptions: int
    contact_unread_hint: int
    recent_webhook_count: int


class ImpersonateResponse(BaseModel):
    token: str
    user_id: int
    email: str
