import { Progress } from "@/components/ui/progress";
import type { IngestBatch, IngestCredits } from "@/lib/api/ingest";
import { countOf, finishedCount, ITEM_STATUS_LABELS, statusesPresent } from "../domain/statuses";
import { panelLabel } from "./BatchPlanPanel";

function credits(count: number, kind: string): string {
  return `${count} ${kind} credit${count === 1 ? "" : "s"}`;
}

function both(amount: IngestCredits): string {
  return `${credits(amount.model_credits, "model")} and ${credits(amount.render_credits, "render")}`;
}

/** "Charged 3 model credits and 21 render credits · given back 0 …", once anything was. */
function SettledCredits({ batch }: { batch: IngestBatch }) {
  const { charged, refunded } = batch;
  if (!charged || !refunded) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Charged {both(charged)} · given back {both(refunded)}
    </p>
  );
}

/**
 * A batch's designs counted by status (the API's GROUP BY, never counters that drift), how many
 * have finished, and its credits: the price, what its designs and their renders hold now, what
 * was charged and what was given back.
 */
export function BatchCounts({ batch }: { batch: IngestBatch }) {
  const finished = finishedCount(batch);
  const percent = batch.item_count > 0 ? Math.round((finished / batch.item_count) * 100) : 0;
  return (
    <section className="space-y-4" aria-label="Designs by status">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {statusesPresent(batch).map((status) => (
          <div key={status} className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {ITEM_STATUS_LABELS[status]}
            </dt>
            <dd className="mt-1 text-3xl font-light tracking-[-0.06em] tabular-nums">{countOf(batch, status)}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1.5">
        <Progress value={percent} aria-label="Designs finished" />
        <p className="text-xs text-muted-foreground">
          {finished} of {batch.item_count} designs finished
        </p>
      </div>
      <div className="space-y-1">
        <p className={panelLabel}>Credits</p>
        <p className="text-xs text-muted-foreground">
          Price {both(batch.quote)} · held now {both(batch.held)}
        </p>
        <SettledCredits batch={batch} />
      </div>
    </section>
  );
}
