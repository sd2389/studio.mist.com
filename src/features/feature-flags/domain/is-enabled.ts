import type { FeatureFlagsSnapshot, FeatureKey } from "@/lib/feature-flags/types";

export function isFeatureEnabled(
  snapshot: FeatureFlagsSnapshot | null | undefined,
  key: FeatureKey,
): boolean {
  if (!snapshot) return true;
  return snapshot.flags[key] ?? true;
}
