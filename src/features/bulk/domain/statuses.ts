import type { IngestBatch, IngestBatchStatus, IngestItem, IngestItemStatus } from "@/lib/api/ingest";
import { ITEM_STATUSES } from "@/lib/api/ingest";

export const ITEM_STATUS_LABELS: Record<IngestItemStatus, string> = {
  awaiting_upload: "Awaiting upload",
  uploaded: "Uploaded",
  converting: "Converting",
  converted: "Converted",
  rendering: "Rendering",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
  canceled: "Canceled",
};

export const BATCH_STATUS_LABELS: Record<IngestBatchStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  canceled: "Canceled",
};

/** A design in one of these never moves on by itself (FINISHED_ITEM_STATUSES). */
const FINISHED_ITEM_STATUSES: ReadonlySet<IngestItemStatus> = new Set(["done", "failed", "skipped", "canceled"]);

/** Draft or processing: designs can still be uploaded, and the batch canceled. */
export function isBatchOpen(batch: Pick<IngestBatch, "status">): boolean {
  return batch.status === "draft" || batch.status === "processing";
}

/** Submitted and unfinished: its designs move on by themselves, so the page keeps polling. */
export function isBatchActive(batch: Pick<IngestBatch, "status">): boolean {
  return batch.status === "processing";
}

/** Its archive is queued or being built. */
export function isArchiveBuilding(batch: Pick<IngestBatch, "archive">): boolean {
  const status = batch.archive?.job?.status;
  return status === "queued" || status === "running";
}

/** Something on the page moves on by itself: its designs, or its archive. */
export function isBatchFollowed(batch: Pick<IngestBatch, "status" | "archive">): boolean {
  return isBatchActive(batch) || isArchiveBuilding(batch);
}

/** Finished: its archive can be built (once a design has made something). */
export function isBatchFinished(batch: Pick<IngestBatch, "status">): boolean {
  return batch.status === "completed" || batch.status === "completed_with_errors" || batch.status === "canceled";
}

/** Failed designs can be converted again only once the batch is submitted. */
export function canRetryFailed(batch: Pick<IngestBatch, "status" | "counts">): boolean {
  return (batch.status === "processing" || batch.status === "completed_with_errors") && (batch.counts.failed ?? 0) > 0;
}

export function countOf(batch: Pick<IngestBatch, "counts">, status: IngestItemStatus): number {
  return batch.counts[status] ?? 0;
}

/** Designs that won't move on again, of every design in the batch. */
export function finishedCount(batch: Pick<IngestBatch, "counts">): number {
  return ITEM_STATUSES.filter((status) => FINISHED_ITEM_STATUSES.has(status)).reduce(
    (total, status) => total + countOf(batch, status),
    0,
  );
}

/** The statuses a batch's designs are at, in pipeline order. */
export function statusesPresent(batch: Pick<IngestBatch, "counts">): IngestItemStatus[] {
  return ITEM_STATUSES.filter((status) => countOf(batch, status) > 0);
}

/** Why a design stopped, in words, for an error the API gave no message for. */
const ERROR_CODE_WORDS: Record<string, string> = {
  sku_taken: "Its SKU belongs to another scene now.",
  over_polygon_cap: "It has more polygons than the plan allows, even decimated.",
  model_unreadable: "Its file couldn't be read as a model.",
  over_limit: "There's no room left in storage for it.",
  timeout: "Converting it took too long.",
  canceled: "Canceled.",
};

/** What a design that failed, was skipped or canceled says about it; null for the others. */
export function itemErrorText(item: Pick<IngestItem, "error" | "error_code">): string | null {
  if (item.error) return item.error;
  if (item.error_code) return ERROR_CODE_WORDS[item.error_code] ?? item.error_code.replace(/_/g, " ");
  return null;
}

/**
 * Said over a batch while its designs convert and render: on our servers, a few at a time, its
 * credits held until each part is made (ADR 0006, "Credits for a batch").
 */
export const PIPELINE_NOTE =
  "Designs convert, then render, on our servers, a few at a time. Their credits are held until each part is made: " +
  "a render is charged once it is ready, and canceling gives back everything that hasn't finished.";

/** What a design at a stage it moves on from by itself is waiting for; its renders show their own progress. */
export function stageWaitNote(status: IngestItemStatus): string | null {
  if (status === "converting") return "Queued for conversion on our servers.";
  if (status === "converted") return "Converted. Its renders are being queued.";
  if (status === "uploaded") return "Uploaded. It converts once the batch is submitted.";
  return null;
}
