import { isFeatureEnabled } from "@/lib/feature-flags/is-enabled";
import type { FeatureFlagsSnapshot } from "@/lib/feature-flags/types";

/** How long the flags may take before exports go on as they are by default (off). */
const FLAGS_TIMEOUT_MS = 5000;

let known: boolean | null = null;
let pending: Promise<boolean> | null = null;

async function readServerExports(): Promise<boolean> {
  const res = await fetch("/api/features", { signal: AbortSignal.timeout(FLAGS_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Feature flags answered ${res.status}`);
  return isFeatureEnabled((await res.json()) as FeatureFlagsSnapshot, "server_exports");
}

/**
 * Whether exports render on the server (the `server_exports` flag, ADR 0005): read once a page
 * and kept, callers asking at the same time sharing one request. When the flags can't be read
 * the answer is the flag's default, off, and the next call asks again.
 */
export function loadServerExports(): Promise<boolean> {
  if (known !== null) return Promise.resolve(known);
  pending ??= readServerExports()
    .then((enabled) => (known = enabled))
    .catch(() => false)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** The flag once it has been read on this page; null before. */
export function knownServerExports(): boolean | null {
  return known;
}
