from datetime import datetime

from pydantic import BaseModel, Field


class QuotaBalances(BaseModel):
    model_credits: int
    ai_image_credits: int
    custom_material_credits: int
    custom_asset_credits: int
    storage_bytes_used: int
    storage_bytes_limit: int


class PlanFeatures(BaseModel):
    max_variants_per_model: int
    max_image_resolution: int
    watermark_exports: bool
    embed_enabled: bool
    batch_export_enabled: bool
    video_8k_enabled: bool


class UserBillingSnapshot(BaseModel):
    plan_tier: str
    plan_label: str
    period_start: datetime | None
    period_end: datetime | None
    balances: QuotaBalances
    allotments: QuotaBalances
    features: PlanFeatures
    stripe_customer_id: str | None = None
    has_active_subscription: bool = False


class CheckoutSubscriptionRequest(BaseModel):
    price_id: str = Field(min_length=3, max_length=255)


class CheckoutTopUpRequest(BaseModel):
    pack_id: str = Field(min_length=2, max_length=64)


class CheckoutResponse(BaseModel):
    url: str


class PortalResponse(BaseModel):
    url: str


class PricingPlan(BaseModel):
    tier: str
    label: str
    monthly_price_label: str
    quotas: QuotaBalances
    features: PlanFeatures
    stripe_price_id: str | None = None


class PricingCatalog(BaseModel):
    plans: list[PricingPlan]
    top_ups: list[dict[str, str | int | None]]
