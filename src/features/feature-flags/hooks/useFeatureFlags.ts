"use client";

import { useEffect, useState } from "react";
import { isFeatureEnabled } from "@/features/feature-flags/domain/is-enabled";
import type { FeatureFlagsSnapshot, FeatureKey } from "@/lib/feature-flags/types";

export function useFeatureFlags(initial?: FeatureFlagsSnapshot | null) {
  const [snapshot, setSnapshot] = useState<FeatureFlagsSnapshot | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/features");
        if (!res.ok) return;
        const json = (await res.json()) as FeatureFlagsSnapshot;
        if (!cancelled) setSnapshot(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  function enabled(key: FeatureKey): boolean {
    return isFeatureEnabled(snapshot, key);
  }

  return { snapshot, loading, enabled };
}
