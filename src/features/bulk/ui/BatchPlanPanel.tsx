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
};

/**
 * What the plan lets a batch hold and what this one costs: a model credit a design (renders
 * aren't part of bulk uploads yet), and the balance it leaves. Over a limit, or short of
 * credits, it says so with an upgrade link, as the API's 402 would.
 */
export function BatchPlanPanel({ billing, designCount, bytes, quote }: BatchPlanPanelProps) {
  const limits = billing?.features.bulk_upload ?? null;
  const planLabel = billing?.plan_label ?? "Your plan";
  const refusal = limits ? planRefusal(designCount, bytes, limits, planLabel) : null;
  const modelCredits = quote?.model_credits ?? designCount;
  const renderCredits = quote?.render_credits ?? 0;
  const balance = billing?.balances.model_credits ?? null;
  const short = balance === null ? 0 : modelCredits - balance;

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
        <p className="text-xs text-muted-foreground">
          {credits(renderCredits, "render")}: renders aren&apos;t part of bulk uploads yet.
        </p>
        {balance !== null ? (
          <p className="text-xs text-muted-foreground">
            You have {credits(balance, "model")}; {Math.max(0, balance - modelCredits)} left after this batch.
          </p>
        ) : null}
        {short > 0 ? (
          <UpgradePrompt className="text-destructive">
            Submitting it needs {credits(short, "model")} more than you have.
          </UpgradePrompt>
        ) : null}
        <p className="text-xs text-muted-foreground">Credits are held when the batch is submitted, and given back for designs that fail or are canceled.</p>
      </div>
    </div>
  );
}
