from datetime import datetime

from pydantic import BaseModel, Field


class QuotaBalances(BaseModel):
    model_credits: int
    ai_image_credits: int
    render_credits: int
    custom_material_credits: int
    custom_asset_credits: int
    storage_bytes_used: int
    storage_bytes_limit: int


class BoughtBalances(BaseModel):
    """Of each balance, the credits the customer bought: spent last, kept at renewal."""

    model_credits: int = 0
    ai_image_credits: int = 0
    render_credits: int = 0


class BulkUploadLimits(BaseModel):
    """What one bulk upload may hold on the plan (BATCH_LIMITS, docs/adr/0006-bulk-pipeline.md),
    so the upload page can say so before anything uploads."""

    max_designs: int  # 0: the plan has no bulk upload
    max_bytes: int  # every file of a batch, companions included
    max_file_bytes: int
    max_open_batches: int


class PlanFeatures(BaseModel):
    max_variants_per_model: int
    max_image_resolution: int
    max_polygons: int
    watermark_exports: bool
    embed_enabled: bool
    batch_export_enabled: bool
    video_8k_enabled: bool
    campaign_pack_enabled: bool
    bulk_upload: BulkUploadLimits
    # What a server video may be (render_jobs/plan_limits.py refuses the rest): its frame rate,
    # its length, and its length at 8K (0: no 8K video). The studio's pickers lock past them.
    max_video_fps: int
    max_video_seconds: int
    max_8k_video_seconds: int


class UserBillingSnapshot(BaseModel):
    plan_tier: str
    plan_label: str
    period_start: datetime | None
    period_end: datetime | None
    balances: QuotaBalances  # what can be spent: plan and bought credits together
    bought_balances: BoughtBalances = Field(default_factory=BoughtBalances)
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
