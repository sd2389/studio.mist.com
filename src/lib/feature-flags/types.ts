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
  | "pricing_page"
  | "server_exports"
  | "bulk_pipeline";

/** The API's flags; a key it doesn't send takes its default (`isFeatureEnabled`). */
export type FeatureFlagsSnapshot = {
  flags: Partial<Record<FeatureKey, boolean>>;
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
