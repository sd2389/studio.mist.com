export type FeatureKey =
  | "upload"
  | "viewer"
  | "variants"
  | "batch_export"
  | "embed"
  | "ai_background"
  | "ai_on_model"
  | "gallery"
  | "stones"
  | "catalog"
  | "library"
  | "billing"
  | "pricing_page";

export type FeatureFlagsSnapshot = {
  flags: Record<FeatureKey, boolean>;
};

export type FeatureFlagRow = {
  key: FeatureKey;
  label: string;
  description: string;
  category: string;
  default_enabled: boolean;
  enabled: boolean;
  updated_at: string | null;
};

export type FeatureFlagsAdminResponse = {
  features: FeatureFlagRow[];
};
