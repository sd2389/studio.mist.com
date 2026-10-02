import { Check, Minus } from "lucide-react";
import type { PricingPlan } from "@/lib/billing/types";
import { PLAN_COMPARISON, refillsMonthly, type PlanCell } from "./plan-presentation";

function CellValue({ value }: { value: PlanCell }) {
  if (value === true) {
    return (
      <>
        <Check aria-hidden strokeWidth={1.75} className="size-4 text-mkt-glacier" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus aria-hidden strokeWidth={1.75} className="size-4 text-mkt-faint" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <>{value}</>;
}

function joinLabels(labels: string[]): string {
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : (labels[0] ?? "");
}

function creditCadenceNote(plans: PricingPlan[]): string {
  const monthly = plans.filter(refillsMonthly).map((plan) => plan.label);
  const oneTime = plans.filter((plan) => !refillsMonthly(plan)).map((plan) => plan.label);
  const parts = [];
  if (monthly.length) parts.push(`${joinLabels(monthly)} credits refill at the start of each billing month and don't roll over.`);
  if (oneTime.length) parts.push(`${joinLabels(oneTime)} credits are a one-time allowance.`);
  return parts.join(" ");
}

/** Plan-by-plan table; scrolls sideways inside its own box on narrow screens. */
export function PricingComparison({ plans }: { plans: PricingPlan[] }) {
  return (
    <section aria-labelledby="compare-plans-title">
      <h2 id="compare-plans-title" className="text-balance text-[clamp(2rem,1.25rem+2.3vw,3rem)] font-light leading-[1.05] tracking-[-0.045em] text-mkt-ink">
        Compare plans
      </h2>
      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">What each plan includes</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[40%] pb-5">
                <span className="sr-only">Feature</span>
              </th>
              {plans.map((plan) => (
                <th key={plan.tier} scope="col" className="pb-5 align-bottom font-normal">
                  <span className="block text-[15px] font-medium text-mkt-ink">{plan.label}</span>
                  <span className="block text-[14px] text-mkt-muted">{plan.monthly_price_label}</span>
                </th>
              ))}
            </tr>
          </thead>
          {PLAN_COMPARISON.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th colSpan={plans.length + 1} scope="colgroup" className="pb-3 pt-10 text-[13px] font-medium text-mkt-ink">
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="border-t border-mkt-line">
                  <th scope="row" className="py-4 pr-6 align-top font-normal">
                    <span className="block text-[15px] text-mkt-ink">{row.label}</span>
                    {row.hint ? <span className="mt-0.5 block text-[13px] leading-snug text-mkt-muted">{row.hint}</span> : null}
                  </th>
                  {plans.map((plan) => (
                    <td key={plan.tier} className="py-4 pr-4 align-top text-[15px] text-mkt-body">
                      <CellValue value={row.value(plan)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="mt-8 max-w-[70ch] text-[14px] leading-relaxed text-mkt-muted">{creditCadenceNote(plans)}</p>
    </section>
  );
}
