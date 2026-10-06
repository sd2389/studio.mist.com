import Link from "next/link";
import type { IngestBatch } from "@/lib/api/ingest";
import { formatRelativeTime } from "@/lib/relative-time";
import { countOf, ITEM_STATUS_LABELS, statusesPresent } from "../domain/statuses";
import { BatchStatusBadge } from "./BatchBadges";
import { panelLabel } from "./BatchPlanPanel";

/** "3 converting · 1 failed": where a batch's designs are. */
export function batchCountsLine(batch: IngestBatch): string {
  return statusesPresent(batch)
    .map((status) => `${countOf(batch, status)} ${ITEM_STATUS_LABELS[status].toLowerCase()}`)
    .join(" · ");
}

/** The user's newest batches, each linking to its page. */
export function RecentBatches({ batches }: { batches: IngestBatch[] }) {
  if (batches.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Recent batches">
      <p className={panelLabel}>Recent batches</p>
      <ul className="space-y-2">
        {batches.map((batch) => (
          <li key={batch.id}>
            <Link
              href={`/bulk/${batch.id}`}
              className="block rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 transition-colors hover:border-foreground/30"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-foreground">{batch.name}</span>
                <BatchStatusBadge status={batch.status} className="shrink-0" />
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {[`${batch.item_count} design${batch.item_count === 1 ? "" : "s"}`, batchCountsLine(batch), formatRelativeTime(batch.created_at)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
