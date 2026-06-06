export type QuotaBalances = {
  model_credits: number;
  ai_image_credits: number;
  custom_material_credits: number;
  custom_asset_credits: number;
  storage_bytes_used: number;
  storage_bytes_limit: number;
};

export type PlanFeatures = {
  max_variants_per_model: number;
  max_image_resolution: number;
  watermark_exports: boolean;
  embed_enabled: boolean;
  batch_export_enabled: boolean;
  video_8k_enabled: boolean;
};

export type UserBillingSnapshot = {
  plan_tier: string;
  plan_label: string;
  period_start: string | null;
  period_end: string | null;
  balances: QuotaBalances;
  allotments: QuotaBalances;
  features: PlanFeatures;
  stripe_customer_id: string | null;
  has_active_subscription: boolean;
};

export type PricingPlan = {
  tier: string;
  label: string;
  monthly_price_label: string;
  quotas: QuotaBalances;
  features: PlanFeatures;
  stripe_price_id: string | null;
};

export type PricingCatalog = {
  plans: PricingPlan[];
  top_ups: Array<{
    id: string;
    label: string;
    credits: number;
    kind: string;
    stripe_price_id: string | null;
  }>;
};
