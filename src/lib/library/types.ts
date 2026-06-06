/** User library DTOs — custom materials and uploaded assets. */

export type UserMaterialItem = {
  id: number;
  kind: "metal" | "gem";
  slug: string;
  label: string;
  params: Record<string, unknown>;
  category?: string | null;
  family?: string | null;
  gem_family?: string | null;
  swatch_url: string | null;
  sort_weight: number;
  created_at?: string | null;
};

export type UserAssetItem = {
  id: number;
  asset_type: "background" | "metal_env" | "gem_env";
  label: string;
  url: string | null;
  preview_url: string | null;
  mime_type?: string | null;
  byte_size?: number | null;
  meta: Record<string, unknown>;
  created_at?: string | null;
};

export type LibraryPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type CreateUserMaterialPayload = {
  kind: "metal" | "gem";
  label: string;
  params: Record<string, unknown>;
  category?: string | null;
  family?: string | null;
  gem_family?: string | null;
};
