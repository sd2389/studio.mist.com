/** Client helpers for the authenticated user library API. */

import type {
  CreateUserMaterialPayload,
  LibraryPage,
  UserAssetItem,
  UserMaterialItem,
} from "@/lib/library/types";

async function libraryFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, { ...init, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(body.error ?? body.detail ?? `Library request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function fetchUserMaterials(
  opts: { kind?: "metal" | "gem"; limit?: number; offset?: number } = {},
): Promise<LibraryPage<UserMaterialItem>> {
  const query = new URLSearchParams();
  if (opts.kind) query.set("kind", opts.kind);
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts.offset !== undefined) query.set("offset", String(opts.offset));
  const qs = query.toString();
  return libraryFetch(`/api/library/materials${qs ? `?${qs}` : ""}`);
}

export function createUserMaterial(body: CreateUserMaterialPayload): Promise<UserMaterialItem> {
  return libraryFetch("/api/library/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteUserMaterial(id: number): Promise<{ ok: boolean }> {
  return libraryFetch(`/api/library/materials/${id}`, { method: "DELETE" });
}

export function fetchUserAssets(
  opts: { asset_type?: "background" | "metal_env" | "gem_env"; limit?: number; offset?: number } = {},
): Promise<LibraryPage<UserAssetItem>> {
  const query = new URLSearchParams();
  if (opts.asset_type) query.set("asset_type", opts.asset_type);
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts.offset !== undefined) query.set("offset", String(opts.offset));
  const qs = query.toString();
  return libraryFetch(`/api/library/assets${qs ? `?${qs}` : ""}`);
}

export async function uploadUserAsset(
  file: File,
  assetType: "background" | "metal_env" | "gem_env",
  label?: string,
): Promise<UserAssetItem> {
  const form = new FormData();
  form.append("file", file);
  form.append("asset_type", assetType);
  if (label) form.append("label", label);
  return libraryFetch("/api/library/assets/upload", { method: "POST", body: form });
}

export function deleteUserAsset(id: number): Promise<{ ok: boolean }> {
  return libraryFetch(`/api/library/assets/${id}`, { method: "DELETE" });
}
