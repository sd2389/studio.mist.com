import "server-only";

import { readUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";
import type { ApiKeyList } from "@/lib/api/api-keys";

/** The signed-in user's API keys; null when they can't be read. */
export async function fetchApiKeysServer(): Promise<ApiKeyList | null> {
  const upstream = await upstreamFetch("/api-keys");
  if (!upstream.ok) return null;
  return (await readUpstreamJson(upstream)) as ApiKeyList;
}
