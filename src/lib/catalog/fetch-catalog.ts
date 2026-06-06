/** Client helpers for the catalog API (served via Next proxy routes). */

import type {
  BackgroundItem,
  CatalogPage,
  EnvironmentItem,
  GemItem,
  GroundItem,
  MetalItem,
  ScenePresetItem,
} from "@/lib/catalog/types";

async function getPage<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  const res = await fetch(`${path}${qs ? `?${qs}` : ""}`, { cache: "no-store", credentials: "include" });
  if (!res.ok) {
    throw new Error(`Catalog request failed: ${path} (${res.status})`);
  }
  return (await res.json()) as T;
}

export function fetchMetals(
  opts: { category?: string; family?: string; limit?: number; offset?: number } = {},
): Promise<CatalogPage<MetalItem>> {
  return getPage("/api/catalog/metals", { ...opts });
}

export function fetchGems(
  opts: { gem_family?: string; limit?: number; offset?: number } = {},
): Promise<CatalogPage<GemItem>> {
  return getPage("/api/catalog/gems", { ...opts });
}

export function fetchEnvironments(
  opts: { env_type?: string; limit?: number; offset?: number } = {},
): Promise<CatalogPage<EnvironmentItem>> {
  return getPage("/api/catalog/scenes", { kind: "environments", ...opts });
}

export function fetchBackgrounds(
  opts: { limit?: number; offset?: number } = {},
): Promise<CatalogPage<BackgroundItem>> {
  return getPage("/api/catalog/scenes", { kind: "backgrounds", ...opts });
}

export function fetchGrounds(
  opts: { limit?: number; offset?: number } = {},
): Promise<CatalogPage<GroundItem>> {
  return getPage("/api/catalog/scenes", { kind: "grounds", ...opts });
}

export function fetchScenePresets(
  opts: { limit?: number; offset?: number } = {},
): Promise<CatalogPage<ScenePresetItem>> {
  return getPage("/api/catalog/scenes", { kind: "scene-presets", ...opts });
}
