"use client";

import { Loader2 } from "lucide-react";
import { ctaSecondary } from "@/components/site/site-styles";
import type { PricingCatalog } from "@/lib/billing/types";

type TopUp = PricingCatalog["top_ups"][number];

/** Top-up kinds the backend can credit (backend/app/features/billing/quota_service.py). */
const KIND_LABELS: Record<string, string> = {
  model: "Adds model uploads",
  ai: "Adds AI image credits",
};

type PricingTopUpsProps = {
  topUps: TopUp[];
  busy: string | null;
  onBuy: (packId: string) => void;
};

export function PricingTopUps({ topUps, busy, onBuy }: PricingTopUpsProps) {
  if (topUps.length === 0) return null;
  return (
    <section aria-labelledby="top-ups-title">
      <h2 id="top-ups-title" className="text-balance text-[clamp(2rem,1.25rem+2.3vw,3rem)] font-light leading-[1.05] tracking-[-0.045em] text-mkt-ink">
        Top up any time
      </h2>
      <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-mkt-body">
        One-time packs for a busy month. Credits are added to your account as soon as the payment goes through.
      </p>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {topUps.map((pack) => {
          const available = Boolean(pack.stripe_price_id);
          return (
            <li key={pack.id} className="flex items-center justify-between gap-4 rounded-[24px] border border-mkt-line bg-mkt-mist/60 p-5 sm:p-6">
              <div>
                <p className="text-[17px] text-mkt-ink">{pack.label}</p>
                <p className="mt-0.5 text-[14px] text-mkt-muted">{KIND_LABELS[pack.kind] ?? "One-time credits"}</p>
              </div>
              <button
                type="button"
                onClick={() => onBuy(pack.id)}
                disabled={!available || busy === pack.id}
                className={`${ctaSecondary} h-11 px-5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0`}
              >
                {busy === pack.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {available ? "Buy" : "Available soon"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
