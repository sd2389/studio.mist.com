import type {
  FeatureFlagsAdminResponse,
  FeatureFlagsSnapshot,
  FeatureKey,
} from "@/lib/feature-flags/types";
import { upstreamFetch, readUpstreamJson, upstreamError } from "@/lib/auth/upstream";

export async function fetchFeatureFlagsServer(): Promise<FeatureFlagsSnapshot> {
  const upstream = await upstreamFetch("/features");
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    throw new Error(upstreamError(json, "Failed to load feature flags"));
  }
  return json as FeatureFlagsSnapshot;
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

export function isFeatureEnabled(
  snapshot: FeatureFlagsSnapshot | null | undefined,
  key: FeatureKey,
): boolean {
  if (!snapshot) return true;
  return snapshot.flags[key] ?? true;
}
