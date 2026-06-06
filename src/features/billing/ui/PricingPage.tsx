"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatStorageGb } from "@/lib/billing/format";
import { startSubscriptionCheckout, startTopUpCheckout } from "@/lib/billing/client";
import type { PricingCatalog } from "@/lib/billing/types";

type PricingPageProps = {
  catalog: PricingCatalog;
  isAuthenticated: boolean;
};

export function PricingPageClient({ catalog, isAuthenticated }: PricingPageProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(priceId: string | null, tier: string) {
    if (!isAuthenticated) {
      window.location.href = `/signup?next=/pricing`;
      return;
    }
    if (!priceId) {
      if (tier === "free") {
        window.location.href = "/dashboard";
        return;
      }
      setError("Stripe price not configured for this plan.");
      return;
    }
    setBusy(tier);
    setError(null);
    try {
      const url = await startSubscriptionCheckout(priceId);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setBusy(null);
    }
  }

  async function buyTopUp(packId: string) {
    if (!isAuthenticated) {
      window.location.href = `/signup?next=/pricing`;
      return;
    }
    setBusy(packId);
    setError(null);
    try {
      const url = await startTopUpCheckout(packId);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Top-up failed");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-app-canvas">
      {isAuthenticated ? <AppHeader /> : null}
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <header className="mb-12 text-center">
          <h1 className="font-display text-4xl font-normal italic tracking-tight text-foreground sm:text-5xl">
            Plans & pricing
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Model credits, AI generations, custom materials, and storage — metered per plan.
          </p>
        </header>

        {error ? (
          <p className="mb-8 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          {catalog.plans.map((plan) => (
            <Card
              key={plan.tier}
              className={plan.tier === "grow" ? "border-primary/40 ring-1 ring-primary/20" : ""}
            >
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  {plan.label}
                </p>
                <CardTitle className="text-3xl">{plan.monthly_price_label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {plan.quotas.model_credits} model credits / month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {plan.quotas.ai_image_credits} AI image credits / month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {plan.quotas.custom_material_credits} custom materials
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {formatStorageGb(plan.quotas.storage_bytes_limit)} storage
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    Up to {plan.features.max_variants_per_model} variants / model
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {plan.features.max_image_resolution}px exports
                  </li>
                </ul>
                <Button
                  className="w-full"
                  variant={plan.tier === "grow" ? "default" : "outline"}
                  onClick={() => subscribe(plan.stripe_price_id, plan.tier)}
                  disabled={busy === plan.tier}
                >
                  {busy === plan.tier ? <Loader2 className="size-4 animate-spin" /> : null}
                  {plan.tier === "free" ? "Get started" : `Choose ${plan.label}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="mt-16 space-y-6">
          <h2 className="text-center text-2xl font-semibold text-foreground">Credit top-ups</h2>
          <p className="text-center text-sm text-muted-foreground">
            One-time purchases — credits apply immediately after payment.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {catalog.top_ups.map((pack) => (
              <Card key={pack.id}>
                <CardContent className="space-y-3 p-6">
                  <p className="font-medium text-foreground">{pack.label}</p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => buyTopUp(pack.id)}
                    disabled={!pack.stripe_price_id || busy === pack.id}
                  >
                    {busy === pack.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    {pack.stripe_price_id ? "Buy now" : "Coming soon"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <footer className="mt-16 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacy Policy
          </Link>
          <Link href="/refund" className="hover:text-foreground hover:underline">
            Refund Policy
          </Link>
        </footer>
      </main>
    </div>
  );
}
