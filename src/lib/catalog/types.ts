/**
 * Catalog DTOs returned by our own auth-gated catalog API. All entries are
 * parametric (numbers/specs the renderer applies) — there are no downloadable
 * proprietary material files.
 */

export type CatalogItem = {
  slug: string;
  label: string;
  params: Record<string, unknown>;
  sort_weight: number;
  swatch_url: string | null;
};

export type MetalItem = CatalogItem & {
  category: "metal" | "surface";
  family: string;
};

export type GemItem = CatalogItem & {
  gem_family: string;
};

export type EnvironmentItem = CatalogItem & {
  env_type: "metal_env" | "gem_env";
  preview_url: string | null;
  master_url: string | null;
  default_rotation: number;
  default_intensity: number;
};

export type BackgroundItem = CatalogItem & {
  is_transparent: boolean;
};

export type GroundItem = CatalogItem;

export type ScenePresetItem = CatalogItem;

export type CatalogPage<T extends CatalogItem> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
