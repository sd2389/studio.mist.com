import "server-only";

import { authHeaders } from "@/lib/auth/server-session";
import { getServerApiUrl } from "@/lib/api-url";
import type { LibraryPage, UserAssetItem, UserMaterialItem } from "@/lib/library/types";

const LIBRARY_PAGE_SIZE = 48;

async function fetchLibraryPage<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<LibraryPage<T> | null> {
  const base = getServerApiUrl();
  if (!base) return null;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }

  const auth = await authHeaders();
  const headers = new Headers(auth);

  try {
    const res = await fetch(`${base}${path}?${query}`, {
      headers,
      cache: "no-store",
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return (await res.json()) as LibraryPage<T>;
  } catch {
    return null;
  }
}

export async function fetchUserMaterialsServer(
  opts: { kind?: "metal" | "gem"; limit?: number; offset?: number } = {},
): Promise<LibraryPage<UserMaterialItem> | null> {
  const params: Record<string, string | number> = {
    limit: opts.limit ?? LIBRARY_PAGE_SIZE,
    offset: opts.offset ?? 0,
  };
  if (opts.kind) params.kind = opts.kind;
  return fetchLibraryPage<UserMaterialItem>("/library/materials", params);
}

export async function fetchUserAssetsServer(
  opts: { asset_type?: "background" | "metal_env" | "gem_env"; limit?: number; offset?: number } = {},
): Promise<LibraryPage<UserAssetItem> | null> {
  const params: Record<string, string | number> = {
    limit: opts.limit ?? LIBRARY_PAGE_SIZE,
    offset: opts.offset ?? 0,
  };
  if (opts.asset_type) params.asset_type = opts.asset_type;
  return fetchLibraryPage<UserAssetItem>("/library/assets", params);
}

export { LIBRARY_PAGE_SIZE };
