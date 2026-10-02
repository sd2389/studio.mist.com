"use client";

import { Check, Loader2 } from "lucide-react";
import { ctaPrimary, ctaSecondary, kicker } from "@/components/site/site-styles";
import type { PricingPlan } from "@/lib/billing/types";
import { planCardFeatures, planPositioning, splitPriceLabel } from "./plan-presentation";

type PricingPlanCardsProps = {
  plans: PricingPlan[];
  busy: string | null;
  onChoose: (plan: PricingPlan) => void;
};

/** Grow is the tier we recommend: its card carries the hologram's glow, as the film lights what matters. */
const FEATURED_TIER = "grow";

function ctaLabel(plan: PricingPlan): string {
  return plan.tier === "free" ? "Start free" : `Choose ${plan.label}`;
}

function PlanCard({ plan, busy, onChoose }: { plan: PricingPlan; busy: boolean; onChoose: () => void }) {
  const featured = plan.tier === FEATURED_TIER;
  const price = splitPriceLabel(plan.monthly_price_label);
  return (
    <li
      className={`flex flex-col rounded-[24px] border bg-surface p-7 sm:p-9 ${
        featured ? "border-holo/60 shadow-[0_0_70px_-28px_var(--mist-holo)]" : "border-hairline"
      }`}
    >
      <p className={kicker}>{featured ? `${plan.label} · recommended` : plan.label}</p>
      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-[56px] font-light leading-none tracking-[-0.045em]">{price.amount}</span>
        {price.suffix ? <span className="text-[16px] text-dim">{price.suffix}</span> : null}
      </p>
      <p className="mt-4 min-h-[3rem] text-[15px] leading-relaxed text-dim">{planPositioning(plan)}</p>
      <button
        type="button"
        onClick={onChoose}
        disabled={busy}
        aria-busy={busy}
        className={`${featured ? ctaPrimary : ctaSecondary} mt-6 w-full disabled:cursor-wait disabled:opacity-70`}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {ctaLabel(plan)}
      </button>
      <ul className="mt-8 grid gap-3 border-t border-hairline pt-8 text-[15px] text-dim">
        {planCardFeatures(plan).map((line) => (
          <li key={line} className="flex items-start gap-3">
            <Check aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-holo" />
            {line}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function PricingPlanCards({ plans, busy, onChoose }: PricingPlanCardsProps) {
  return (
    <ul className="grid gap-4 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard key={plan.tier} plan={plan} busy={busy === plan.tier} onChoose={() => onChoose(plan)} />
      ))}
    </ul>
  );
}
