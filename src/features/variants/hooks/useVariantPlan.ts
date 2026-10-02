"use client";

import { useEffect, useState } from "react";
import { fetchBillingAccount } from "@/lib/billing/client";
import type { PlanFeatures } from "@/lib/billing/types";

/** The owner's plan as the variant cap needs it. */
export type VariantPlan = {
  features: PlanFeatures;
  planLabel: string;
  /** False on Studio, the top plan: no upgrade raises its cap. */
  canUpgrade: boolean;
};

/**
 * The signed-in owner's plan, read once. Null until it loads (or if it cannot be read); the
 * server enforces the variant cap either way.
 */
export function useVariantPlan(): VariantPlan | null {
  const [plan, setPlan] = useState<VariantPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBillingAccount()
      .then((snapshot) => {
        if (cancelled) return;
        setPlan({
          features: snapshot.features,
          planLabel: snapshot.plan_label,
          canUpgrade: snapshot.plan_tier !== "studio",
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return plan;
}
