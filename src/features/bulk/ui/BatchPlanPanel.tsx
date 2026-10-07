import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import type { IngestCredits } from "@/lib/api/ingest";
import { formatStorageGb } from "@/lib/billing/format";
import type { BulkUploadLimits, UserBillingSnapshot } from "@/lib/billing/types";
import { planRefusal } from "../domain/design-checks";

export const panelLabel = "text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground";

function credits(count: number, kind: string): string {
  return `${count} ${kind} credit${count === 1 ? "" : "s"}`;
}

export function limitsText(limits: BulkUploadLimits, planLabel: string): string {
  if (limits.max_designs === 0) return `${planLabel} has no bulk upload.`;
  return (
    `${planLabel}: up to ${limits.max_designs} designs and ${formatStorageGb(limits.max_bytes)} a batch, ` +
    `${formatStorageGb(limits.max_file_bytes)} a file, ${limits.max_open_batches} batches open at once.`
  );
}

type BatchPlanPanelProps = {
  billing: UserBillingSnapshot | null;
  designCount: number;
  bytes: number;
  /** The made batch's own price, once it exists. */
  quote: IngestCredits | null;
  /** What the render plan costs a design, as the API priced it; null until it has. */
  renderCreditsPerDesign: number | null;
};

/** "You have 480 model credits; 477 left after this batch.", and an upgrade when that's short. */
function BalanceLine({ balance, cost, kind }: { balance: number | null; cost: number | null; kind: string }) {
  if (balance === null || cost === null) return null;
  const short = cost - balance;
  return (
    <>
      <p className="text-xs text-muted-foreground">
        You have {credits(balance, kind)}; {Math.max(0, balance - cost)} left after this batch.
      </p>
      {short > 0 ? (
        <UpgradePrompt className="text-destructive">Submitting it needs {credits(short, kind)} more than you have.</UpgradePrompt>
      ) : null}
    </>
  );
}

/**
 * What the plan lets a batch hold and what this one costs: a model credit a design and its
 * render plan's credits, and the balances it leaves. Over a limit, or short of credits, it says
 * so with an upgrade link, as the API's 402 would.
 */
export function BatchPlanPanel({ billing, designCount, bytes, quote, renderCreditsPerDesign }: BatchPlanPanelProps) {
  const limits = billing?.features.bulk_upload ?? null;
  const planLabel = billing?.plan_label ?? "Your plan";
  const refusal = limits ? planRefusal(designCount, bytes, limits, planLabel) : null;
  const modelCredits = quote?.model_credits ?? designCount;
  const renderCredits = quote?.render_credits ?? (renderCreditsPerDesign === null ? null : renderCreditsPerDesign * designCount);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className={panelLabel}>Plan</p>
        <p className="text-sm text-foreground">{limits ? limitsText(limits, planLabel) : "Your plan's limits couldn't be loaded."}</p>
        {refusal ? <UpgradePrompt className="text-destructive">{refusal}</UpgradePrompt> : null}
      </div>
      <div className="space-y-1.5">
        <p className={panelLabel}>{quote ? "Price" : "Price, before it is made"}</p>
        <p className="text-sm text-foreground">
          {credits(modelCredits, "model")} · one a design
        </p>
        <p className="text-sm text-foreground">
          {renderCredits === null ? "Render credits: pricing…" : `${credits(renderCredits, "render")} · the render plan's`}
        </p>
        <BalanceLine balance={billing?.balances.model_credits ?? null} cost={modelCredits} kind="model" />
        <BalanceLine balance={billing?.balances.render_credits ?? null} cost={renderCredits} kind="render" />
        <p className="text-xs text-muted-foreground">
          Credits are held when the batch is submitted. Each render is charged once it is made; what fails or is
          canceled is given back.
        </p>
      </div>
    </div>
  );
}
