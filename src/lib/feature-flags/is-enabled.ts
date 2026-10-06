import type { FeatureFlagsSnapshot, FeatureKey } from "@/lib/feature-flags/types";

/**
 * Flags that stay off until the admin console turns them on. Every other flag is on unless
 * the snapshot says otherwise, and when the flags can't be read.
 */
const OFF_BY_DEFAULT: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  // Exports rendered on the server (ADR 0005), until the export screens switch over to them.
  "server_exports",
  // Bulk uploads (ADR 0006): the API keeps it off until an admin turns it on.
  "bulk_pipeline",
]);

export function isFeatureEnabled(
  snapshot: FeatureFlagsSnapshot | null | undefined,
  key: FeatureKey,
): boolean {
  return snapshot?.flags[key] ?? !OFF_BY_DEFAULT.has(key);
}
