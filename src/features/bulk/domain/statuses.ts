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
 * Said over a batch with designs converting or converted while the pipeline's later stages
 * aren't running: conversion on our workers (ADR 0006 E2) and render plans (F2).
 */
export const PIPELINE_NOTE =
  "Conversion runs on our servers and isn't switched on yet, so designs wait at Converting. Nothing is spent " +
  "while they wait: their credits are held, and canceling gives them back. Renders come after conversion, in a later release.";

/**
 * What a design waiting at a stage the pipeline doesn't run yet is waiting for: converting on
 * our workers (ADR 0006 E2) and rendering its plan (F2) aren't switched on, so designs stay put.
 */
export function stageWaitNote(status: IngestItemStatus): string | null {
  if (status === "converting") return "Queued for conversion. Conversion on our servers isn't running yet, so it waits here.";
  if (status === "converted") return "Converted. Renders come in a later release, so it waits here.";
  if (status === "uploaded") return "Uploaded. It converts once the batch is submitted.";
  return null;
}
