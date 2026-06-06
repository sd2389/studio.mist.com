import "server-only";

import { getServerApiUrl } from "@/lib/api-url";
import { authHeaders } from "@/lib/auth/server-session";
import type {
  BackgroundItem,
  CatalogItem,
  CatalogPage,
  EnvironmentItem,
  GemItem,
  GroundItem,
  MetalItem,
  ScenePresetItem,
} from "@/lib/catalog/types";

const CATALOG_REVALIDATE_SECONDS = 300;

async function fetchCatalogPage<T extends CatalogItem>(
  path: string,
  params: Record<string, string | number>,
): Promise<CatalogPage<T> | null> {
  const base = getServerApiUrl();
  if (!base) return null;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }

  try {
    const auth = await authHeaders();
    const res = await fetch(`${base}${path}?${query}`, {
      next: { revalidate: CATALOG_REVALIDATE_SECONDS },
      headers: auth,
    });
    if (!res.ok) return null;
    return (await res.json()) as CatalogPage<T>;
  } catch {
    return null;
  }
}

export const EDITOR_CATALOG_PAGE_SIZE = 48;

export async function fetchMetalsCatalogServer(
  opts: { limit?: number; offset?: number } = {},
): Promise<CatalogPage<MetalItem> | null> {
  return fetchCatalogPage<MetalItem>("/catalog/metals", {
    limit: opts.limit ?? EDITOR_CATALOG_PAGE_SIZE,
    offset: opts.offset ?? 0,
  });
}

export async function fetchGemsCatalogServer(
  opts: { limit?: number; offset?: number } = {},
): Promise<CatalogPage<GemItem> | null> {
  return fetchCatalogPage<GemItem>("/catalog/gems", {
    limit: opts.limit ?? EDITOR_CATALOG_PAGE_SIZE,
    offset: opts.offset ?? 0,
  });
}

export async function fetchEnvironmentsCatalogServer(
  opts: { env_type?: string; limit?: number; offset?: number } = {},
): Promise<CatalogPage<EnvironmentItem> | null> {
  const params: Record<string, string | number> = {
    limit: opts.limit ?? EDITOR_CATALOG_PAGE_SIZE,
    offset: opts.offset ?? 0,
  };
  if (opts.env_type) params.env_type = opts.env_type;
  return fetchCatalogPage<EnvironmentItem>("/catalog/environments", params);
}

export async function fetchBackgroundsCatalogServer(
  opts: { limit?: number; offset?: number } = {},
): Promise<CatalogPage<BackgroundItem> | null> {
  return fetchCatalogPage<BackgroundItem>("/catalog/backgrounds", {
    limit: opts.limit ?? EDITOR_CATALOG_PAGE_SIZE,
    offset: opts.offset ?? 0,
  });
}

export async function fetchGroundsCatalogServer(
  opts: { limit?: number; offset?: number } = {},
): Promise<CatalogPage<GroundItem> | null> {
  return fetchCatalogPage<GroundItem>("/catalog/grounds", {
    limit: opts.limit ?? EDITOR_CATALOG_PAGE_SIZE,
    offset: opts.offset ?? 0,
  });
}

export async function fetchScenePresetsCatalogServer(
  opts: { limit?: number; offset?: number } = {},
): Promise<CatalogPage<ScenePresetItem> | null> {
  return fetchCatalogPage<ScenePresetItem>("/catalog/scene-presets", {
    limit: opts.limit ?? EDITOR_CATALOG_PAGE_SIZE,
    offset: opts.offset ?? 0,
  });
}
