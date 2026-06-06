"use client";

import type { ReactNode } from "react";
import { isFeatureEnabled } from "@/features/feature-flags/domain/is-enabled";
import { useFeatureFlags } from "@/features/feature-flags/hooks/useFeatureFlags";
import type { FeatureFlagsSnapshot, FeatureKey } from "@/lib/feature-flags/types";

type FeatureGateProps = {
  feature: FeatureKey;
  initialFlags?: FeatureFlagsSnapshot | null;
  children: ReactNode;
  fallback?: ReactNode;
};

export function FeatureGate({ feature, initialFlags, children, fallback = null }: FeatureGateProps) {
  const { snapshot, loading } = useFeatureFlags(initialFlags);

  if (loading && !initialFlags) return null;
  if (!isFeatureEnabled(snapshot ?? initialFlags, feature)) return <>{fallback}</>;
  return <>{children}</>;
}
