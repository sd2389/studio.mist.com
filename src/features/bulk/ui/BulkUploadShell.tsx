"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IngestBatch } from "@/lib/api/ingest";
import type { UserBillingSnapshot } from "@/lib/billing/types";
import { JEWELRY_CATEGORIES } from "@/lib/upload/categories";
import { MAX_BATCH_NAME_LENGTH, sortProblems } from "../domain/batch-request";
import { batchBytes, planRefusal, skusToCheck, withoutProblems } from "../domain/design-checks";
import { BatchPlanPanel } from "./BatchPlanPanel";
import { BulkDropPanel } from "./BulkDropPanel";
import { BulkUploadActions } from "./BulkUploadActions";
import { DesignList } from "./DesignList";
import { ProblemList } from "./ProblemList";
import { RecentBatches } from "./RecentBatches";
import { useBulkDrop } from "./useBulkDrop";
import { useBulkUploadFlow, type BulkUploadFlow } from "./useBulkUploadFlow";
import { useSkuCheck } from "./useSkuCheck";
import type { DesignUploadState } from "./useBatchUploads";

type BulkUploadShellProps = {
  billing: UserBillingSnapshot | null;
  recentBatches: IngestBatch[];
  userEmail?: string | null;
  isAdmin?: boolean;
};

const selectClass =
  "flex h-10 w-full rounded-full border border-foreground/10 bg-surface/45 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/** Why the batch can't be made yet, or null when it can. */
function blockedReason(
  drop: ReturnType<typeof useBulkDrop>,
  problemCount: number,
  skuCheck: ReturnType<typeof useSkuCheck>,
  refusal: string | null,
): string | null {
  if (drop.reading) return "Opening the files…";
  if (drop.plan.designs.length === 0) return "Drop the designs to upload first.";
  if (refusal) return "This batch is more than the plan takes.";
  if (problemCount > 0) return `Fix the ${problemCount === 1 ? "problem" : `${problemCount} problems`} first, or leave those designs out.`;
  if (skuCheck.checking) return "Checking the SKUs…";
  return null;
}

/** Each design's upload, by its index in the request, once the batch is made. */
function uploadsByDesign(flow: BulkUploadFlow): Map<number, DesignUploadState> | undefined {
  if (!flow.batch) return undefined;
  const byDesign = new Map<number, DesignUploadState>();
  for (const item of flow.batch.items) {
    const state = flow.uploads.states.get(item.id);
    if (state) byDesign.set(item.position, state);
  }
  return byDesign;
}

/**
 * `/bulk/new`: many CAD files at once (files, a folder or ZIPs, with an optional CSV manifest),
 * checked as the API will check them, priced, uploaded straight to storage and submitted.
 */
export function BulkUploadShell({ billing, recentBatches, userEmail, isAdmin }: BulkUploadShellProps) {
  const drop = useBulkDrop(billing?.features.bulk_upload?.max_file_bytes ?? null, billing?.features.bulk_upload?.max_bytes ?? null);
  const { plan } = drop;
  const skuCheck = useSkuCheck(skusToCheck(withoutProblems(plan.designs, plan.problems)));
  const flow = useBulkUploadFlow(drop, skuCheck.held);
  const sorted = sortProblems(flow.problems);
  const bytes = batchBytes(plan.designs);
  const limits = billing?.features.bulk_upload;
  const refusal = limits ? planRefusal(plan.designs.length, bytes, limits, billing?.plan_label ?? "Your plan") : null;
  const made = flow.batch !== null;
  const withProblems = plan.designs.filter((design) => sorted.byDesign.has(design.index));

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader userEmail={userEmail} showAdminLink={isAdmin} />
      <main className="p-3">
        <section className="ice-panel mx-auto min-w-0 max-w-6xl overflow-hidden p-5 sm:p-8">
          <header className="flex flex-col gap-6 border-b border-foreground/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">Workshop / Bulk upload</p>
              <h1 className="mt-7 text-[clamp(3rem,6vw,5.5rem)] font-light leading-[0.8] tracking-[-0.08em]">
                Bulk upload
              </h1>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground sm:text-right">
              Many CAD files at once: each becomes a scene with its SKU, converted on our servers.
            </p>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-5">
              <BulkDropPanel drop={drop} manifestProblems={sorted.manifest} disabled={made} />
              <ProblemList problems={sorted.batch} />
              {skuCheck.error ? (
                <p className="text-xs text-muted-foreground" role="status">
                  The SKUs couldn&apos;t be checked yet ({skuCheck.error}); the batch checks them again when it is made.
                </p>
              ) : null}
              {!made && withProblems.length > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => drop.removeDesigns(withProblems.map((design) => design.files))}>
                  Leave out the {withProblems.length === 1 ? "design" : `${withProblems.length} designs`} with problems
                </Button>
              ) : null}
              <DesignList
                designs={plan.designs}
                problems={sorted.byDesign}
                uploads={uploadsByDesign(flow)}
                onRemove={made ? undefined : (design) => drop.removeDesigns([design.files])}
              />
            </div>

            <aside className="flex flex-col gap-5 rounded-[1.75rem] border border-foreground/[0.06] bg-surface/55 p-5">
              <div className="space-y-2">
                <Label htmlFor="bulk-name" className="text-xs font-medium text-muted-foreground">
                  Batch name
                </Label>
                <Input
                  id="bulk-name"
                  value={flow.name}
                  maxLength={MAX_BATCH_NAME_LENGTH}
                  placeholder={flow.batchName}
                  disabled={made}
                  onChange={(event) => flow.setName(event.target.value)}
                  className="h-10 rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-category" className="text-xs font-medium text-muted-foreground">
                  Category, where the CSV gives none
                </Label>
                <select
                  id="bulk-category"
                  value={drop.defaultCategory}
                  disabled={made}
                  onChange={(event) => drop.setDefaultCategory(event.target.value)}
                  className={selectClass}
                >
                  {JEWELRY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <BatchPlanPanel billing={billing} designCount={plan.designs.length} bytes={bytes} quote={flow.batch?.quote ?? null} />
              <BulkUploadActions
                flow={flow}
                designCount={plan.designs.length}
                blocked={blockedReason(drop, flow.localProblems.length, skuCheck, refusal)}
              />
              {!made && plan.designs.length > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={drop.reset}>
                  Start over
                </Button>
              ) : null}
              <RecentBatches batches={recentBatches} />
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
