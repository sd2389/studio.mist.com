"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PricingCatalog } from "@/lib/billing/types";
import { usePricingCheckout } from "./use-pricing-checkout";

type CreditPack = PricingCatalog["top_ups"][number];

const PACK_HINT: Record<string, string> = {
  model: "Upload and save more pieces",
  ai: "More AI backgrounds and on-model shots",
};

/** One-off credit packs for signed-in users; credits land as soon as checkout completes. */
export function BuyCreditsCard() {
  const [packs, setPacks] = useState<CreditPack[] | null>(null);
  const { busy, error, buyTopUp } = usePricingCheckout(true);

  useEffect(() => {
    let live = true;
    fetch("/api/billing/pricing")
      .then((res) => (res.ok ? (res.json() as Promise<PricingCatalog>) : null))
      .then((catalog) => live && setPacks(catalog?.top_ups ?? []))
      .catch(() => live && setPacks([]));
    return () => {
      live = false;
    };
  }, []);

  return (
    <Card id="credits">
      <CardHeader>
        <CardTitle className="text-lg">Buy more credits</CardTitle>
        <p className="text-sm text-muted-foreground">One-time packs on top of your plan, whenever you need more.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {packs === null ? (
          <p className="text-sm text-muted-foreground">Loading packs…</p>
        ) : packs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credit packs are on sale right now.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {packs.map((pack) => (
              <li key={pack.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{pack.label}</p>
                  <p className="text-xs text-muted-foreground">{PACK_HINT[pack.kind] ?? "Adds credits"}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!pack.stripe_price_id || busy === pack.id}
                  onClick={() => void buyTopUp(pack.id)}
                >
                  {busy === pack.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {pack.stripe_price_id ? "Buy" : "Available soon"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
