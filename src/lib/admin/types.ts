export type AdminUserRow = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  plan_tier: string;
  model_credits: number;
  ai_image_credits: number;
  storage_bytes_used: number;
  scene_count: number;
  created_at: string;
};

export type AdminUserListResponse = {
  users: AdminUserRow[];
  total: number;
};

export type CreditAdjustmentRow = {
  id: number;
  admin_user_id: number;
  admin_email: string;
  target_user_id: number;
  kind: string;
  delta: number;
  reason: string;
  created_at: string;
};

export type AdminUserDetail = {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  scene_count: number;
  billing: import("@/lib/billing/types").UserBillingSnapshot;
  usage: AdminUserUsage;
  recent_adjustments: CreditAdjustmentRow[];
};

export type PlanTierCount = {
  tier: string;
  label: string;
  count: number;
};

export type AdminUsageStats = {
  total_users: number;
  active_users: number;
  new_users_7d: number;
  new_users_30d: number;
  total_cad_models: number;
  cad_models_7d: number;
  cad_models_30d: number;
  total_embedded: number;
  total_renders: number;
  renders_7d: number;
  renders_30d: number;
  total_storage_bytes: number;
  users_by_tier: PlanTierCount[];
};

export type AdminRevenueStats = {
  active_subscriptions: number;
  grow_subscriptions: number;
  studio_subscriptions: number;
  estimated_mrr_cents: number;
  invoice_paid_events_30d: number;
  checkout_completed_30d: number;
  stripe_configured: boolean;
};

export type AdminAnalytics = {
  usage: AdminUsageStats;
  revenue: AdminRevenueStats;
  contact_unread_hint: number;
  recent_webhook_count: number;
};

export type AdminUserUsage = {
  scene_count: number;
  embedded_count: number;
  render_count: number;
  storage_bytes_used: number;
  model_credits_remaining: number;
  ai_credits_remaining: number;
  model_credits_allotment: number;
  ai_credits_allotment: number;
  last_scene_at: string | null;
  last_render_at: string | null;
  has_active_subscription: boolean;
  plan_tier: string;
  plan_label: string;
};

export type TopUserRow = {
  id: number;
  email: string;
  name: string | null;
  plan_tier: string;
  scene_count: number;
  render_count: number;
  storage_bytes_used: number;
  is_active: boolean;
};

export type AdminOverview = {
  user_count: number;
  active_subscriptions: number;
  contact_unread_hint: number;
  recent_webhook_count: number;
};

export type BillingEventRow = {
  id: number;
  stripe_event_id: string;
  event_type: string;
  processed_at: string;
};

export type BillingEventListResponse = {
  events: BillingEventRow[];
  total: number;
};

export type ContactMessageRow = {
  id: number;
  name: string;
  email: string;
  message: string;
  created_at: string;
};

export type ContactMessageListResponse = {
  messages: ContactMessageRow[];
  total: number;
};

export type CreditKind = "model" | "ai" | "custom_material" | "custom_asset" | "storage";
