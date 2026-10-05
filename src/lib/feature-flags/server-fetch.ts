import { NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/feature-flags/is-enabled";
import type {
  FeatureFlagsAdminResponse,
  FeatureFlagsSnapshot,
  FeatureKey,
} from "@/lib/feature-flags/types";
import { upstreamFetch, readUpstreamJson, upstreamError } from "@/lib/auth/upstream";

export { isFeatureEnabled };

export async function fetchFeatureFlagsServer(): Promise<FeatureFlagsSnapshot> {
  const upstream = await upstreamFetch("/features");
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    throw new Error(upstreamError(json, "Failed to load feature flags"));
  }
  return json as FeatureFlagsSnapshot;
}

/** Whether `key` is on; when the flags can't be read, the flag's default. */
export async function isFeatureEnabledServer(key: FeatureKey): Promise<boolean> {
  const flags = await fetchFeatureFlagsServer().catch(() => null);
  return isFeatureEnabled(flags, key);
}

/** For an API route behind a flag: a 404 answer while `key` is off, null when it is on. */
export async function requireFeatureApi(key: FeatureKey): Promise<NextResponse | null> {
  if (await isFeatureEnabledServer(key)) return null;
  return NextResponse.json({ error: "Not available" }, { status: 404 });
}

export async function fetchAdminFeaturesServer(): Promise<FeatureFlagsAdminResponse | null> {
  const upstream = await upstreamFetch("/admin/features");
  const json = await readUpstreamJson(upstream);
  if (upstream.status === 403) return null;
  if (!upstream.ok) {
    throw new Error(upstreamError(json, "Failed to load admin features"));
  }
  return json as FeatureFlagsAdminResponse;
}
