"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChipField } from "@/components/ui/chip";
import type { IngestBatch, IngestItem, IngestItemStatus, IngestPage, IngestRefusal } from "@/lib/api/ingest";
import { formatBytesShort } from "@/lib/admin/format";
import { cn } from "@/lib/utils";
import { ITEM_STATUS_LABELS, itemErrorText, stageWaitNote, statusesPresent } from "../domain/statuses";
import { ItemStatusBadge } from "./BatchBadges";
import type { BatchAction, ItemsQuery } from "./useBatchView";

type StatusFilter = IngestItemStatus | "all";

type BatchItemListProps = {
  batch: IngestBatch;
  items: IngestPage<IngestItem>;
  query: ItemsQuery;
  onStatus: (status: IngestItemStatus | null) => void;
  onPage: (page: number) => void;
  /** Retries one failed design; left out while designs can't be retried. */
  onRetry?: (itemId: number) => void;
  pending: BatchAction | null;
  /** Why a retry left some designs failed. */
  refused: IngestRefusal[];
};

function itemMeta(item: IngestItem): string {
  const parts = [item.sku, item.name, item.category, formatBytesShort(item.bytes + item.companions.reduce((total, file) => total + file.bytes, 0))];
  if (item.size_mm !== null) parts.push(`${Math.round(item.size_mm * 10) / 10} mm long`);
  if (item.polygon_count !== null) parts.push(`${item.polygon_count.toLocaleString("en-US")} triangles`);
  if (item.attempts > 0) parts.push(`retried ${item.attempts === 1 ? "once" : `${item.attempts} times`}`);
  return parts.join(" · ");
}

function ItemRow({ item, onRetry, retrying, refusal }: {
  item: IngestItem;
  onRetry?: (itemId: number) => void;
  retrying: boolean;
  refusal?: IngestRefusal;
}) {
  const error = itemErrorText(item);
  const waiting = stageWaitNote(item.status);
  return (
    <li className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground" title={item.filename}>
            <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{item.position + 1}</span>
            {item.filename}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{itemMeta(item)}</p>
        </div>
        <ItemStatusBadge status={item.status} className="shrink-0" />
      </div>
      {error && item.status !== "done" ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
      {waiting ? <p className="mt-1.5 text-xs text-muted-foreground">{waiting}</p> : null}
      {item.warnings.length > 0 ? <p className="mt-1.5 text-xs text-muted-foreground">{item.warnings.join(" · ")}</p> : null}
      {refusal ? <p className="mt-1.5 text-xs text-destructive">{refusal.message}</p> : null}
      {(onRetry && item.status === "failed") || item.scene_id !== null ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {onRetry && item.status === "failed" ? (
            <Button type="button" variant="outline" size="sm" disabled={retrying} onClick={() => onRetry(item.id)}>
              <RotateCcw aria-hidden />
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          ) : null}
          {item.scene_id !== null ? (
            <Link href={`/model/${item.scene_id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Open in studio
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** A batch's designs, 50 a page, of one status if asked: each with its status and, once stopped, why. */
export function BatchItemList({ batch, items, query, onStatus, onPage, onRetry, pending, refused }: BatchItemListProps) {
  const present = statusesPresent(batch);
  const statuses = query.status && !present.includes(query.status) ? [...present, query.status] : present;
  const options: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    ...statuses.map((status) => ({ value: status, label: ITEM_STATUS_LABELS[status] })),
  ];
  const pageCount = Math.max(1, Math.ceil(items.total / items.limit));
  const refusals = new Map(refused.map((refusal) => [refusal.item_id, refusal]));

  return (
    <section className="space-y-4" aria-label="Designs">
      <ChipField
        label="Show"
        options={options}
        value={query.status ?? "all"}
        onChange={(value) => onStatus(value === "all" ? null : value)}
      />
      {items.items.length > 0 ? (
        <ul className="space-y-2">
          {items.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onRetry={onRetry}
              retrying={pending === `retry-${item.id}`}
              refusal={refusals.get(item.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {query.status ? `No ${ITEM_STATUS_LABELS[query.status].toLowerCase()} designs.` : "No designs."}
        </p>
      )}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 rounded-full border border-foreground/10 bg-surface/40 px-4 py-2">
          <p className="text-sm text-muted-foreground">
            Page <span className="font-medium tabular-nums text-foreground">{items.page}</span> of{" "}
            <span className="tabular-nums">{pageCount}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1" disabled={items.page <= 1} onClick={() => onPage(items.page - 1)}>
              <ChevronLeft className="size-4" aria-hidden />
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              disabled={items.page >= pageCount}
              onClick={() => onPage(items.page + 1)}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
