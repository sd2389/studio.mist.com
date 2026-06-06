import "server-only";

import { loadSourceCatalogServer } from "@/lib/catalog/load-source-catalog";
import { authHeaders } from "@/lib/auth/server-session";
import { getServerApiUrl } from "@/lib/api-url";
import type { Scene, SceneDetail } from "@/lib/api/scenes";
import type { SourceCatalogPayload } from "@/lib/source-catalog";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function backendUrl(path: string): string {
  const api = getServerApiUrl();
  if (!api) {
    throw new Error("Set API_URL or NEXT_PUBLIC_API_URL");
  }
  return `${api}${path.startsWith("/") ? path : `/${path}`}`;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = await authHeaders();
  for (const [key, value] of Object.entries(auth)) {
    if (typeof value === "string") headers.set(key, value);
  }
  return fetch(backendUrl(path), { ...init, headers, cache: "no-store" });
}

export async function fetchScenesServer(): Promise<Scene[]> {
  const res = await authedFetch("/scenes");
  if (!res.ok) {
    const body = await readJson<{ detail?: string; error?: string }>(res);
    throw new Error(body.detail ?? body.error ?? "Failed to load scenes");
  }
  return readJson<Scene[]>(res);
}

export async function fetchSceneByViewerIdServer(viewerId: string): Promise<SceneDetail | null> {
  const res = await fetch(backendUrl(`/scenes/by-model/${encodeURIComponent(viewerId)}`), {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await readJson<{ detail?: string; error?: string }>(res);
    throw new Error(body.detail ?? body.error ?? "Failed to load scene");
  }
  return readJson<SceneDetail>(res);
}

export async function fetchSceneBySkuServer(sku: string): Promise<SceneDetail | null> {
  const res = await fetch(backendUrl(`/scenes/by-sku/${encodeURIComponent(sku)}`), {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await readJson<{ detail?: string; error?: string }>(res);
    throw new Error(body.detail ?? body.error ?? "Failed to load scene");
  }
  return readJson<SceneDetail>(res);
}

/** Resolve embed/share id as SKU first, then viewer model id. */
export async function fetchSceneByEmbedIdServer(embedId: string): Promise<SceneDetail | null> {
  const bySku = await fetchSceneBySkuServer(embedId).catch(() => null);
  if (bySku) return bySku;
  return fetchSceneByViewerIdServer(embedId);
}

export async function fetchSceneByIdServer(id: number): Promise<SceneDetail | null> {
  const res = await authedFetch(`/scenes/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await readJson<{ detail?: string; error?: string }>(res);
    throw new Error(body.detail ?? body.error ?? "Failed to load scene");
  }
  return readJson<SceneDetail>(res);
}

export async function fetchSourceCatalogServer(): Promise<SourceCatalogPayload | null> {
  return loadSourceCatalogServer();
}
