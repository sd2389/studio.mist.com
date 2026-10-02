"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { startSubscriptionCheckout, startTopUpCheckout } from "@/lib/billing/client";
import type { PricingPlan } from "@/lib/billing/types";

const SIGN_UP_THEN_PRICING = "/login?mode=signup&next=/pricing";

/** Plan and top-up checkout: guests sign up first, everyone else goes to Stripe. */
export function usePricingCheckout(isAuthenticated: boolean) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscribe = useCallback(
    async (plan: PricingPlan) => {
      if (!isAuthenticated) return router.push(SIGN_UP_THEN_PRICING);
      if (plan.tier === "free") return router.push("/dashboard");
      if (!plan.stripe_price_id) {
        setError(`Checkout for ${plan.label} isn't set up yet. Please try again later.`);
        return;
      }
      setBusy(plan.tier);
      setError(null);
      try {
        window.location.assign(await startSubscriptionCheckout(plan.stripe_price_id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed");
        setBusy(null);
      }
    },
    [isAuthenticated, router],
  );

  const buyTopUp = useCallback(
    async (packId: string) => {
      if (!isAuthenticated) return router.push(SIGN_UP_THEN_PRICING);
      setBusy(packId);
      setError(null);
      try {
        window.location.assign(await startTopUpCheckout(packId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Top-up failed");
        setBusy(null);
      }
    },
    [isAuthenticated, router],
  );

  return { busy, error, subscribe, buyTopUp };
}
