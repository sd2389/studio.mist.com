"use client";

import { useEffect, useRef, useState } from "react";
import {
  cancelBatch,
  retryFailedItems,
  retryItem,
  submitBatch,
  type BatchView,
  type IngestItemStatus,
  type IngestRefusal,
} from "@/lib/api/ingest";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import { isBatchActive } from "../domain/statuses";
import { loadBatchView, pollBatch } from "../lib/batch-polling";
import type { Refusal } from "./useBulkUploadFlow";

export type ItemsQuery = { status: IngestItemStatus | null; page: number };

export type BatchAction = "cancel" | "retry-failed" | "submit" | `retry-${number}`;

function messageOf(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message ? failure.message : fallback;
}

/**
 * A batch on its page, kept fresh: the page of designs on show is loaded again when the filter
 * or page changes and after every action, and the batch is polled while it is processing, with
 * `pollRenderJob`'s backoff (`pollBatch`). Actions answer the batch as it is now.
 */
export function useBatchView(initial: BatchView) {
  const batchId = initial.batch.id;
  const [view, setView] = useState(initial);
  const [query, setQuery] = useState<ItemsQuery>({ status: null, page: 1 });
  const [refreshes, setRefreshes] = useState(0);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pending, setPending] = useState<BatchAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [refused, setRefused] = useState<IngestRefusal[]>([]);
  const firstRun = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    const itemsQuery = { status: query.status, page: query.page };
    // The page arrived with the batch as it was; every later run reads it again first.
    const fresh = !firstRun.current;
    firstRun.current = false;
    const follow = async () => {
      const start = fresh ? await loadBatchView(batchId, itemsQuery, controller.signal) : initial;
      if (fresh) setView(start);
      if (!isBatchActive(start.batch)) return;
      await pollBatch(batchId, itemsQuery, {
        signal: controller.signal,
        onView: (next) => {
          setView(next);
          setPollError(null);
        },
        onError: (failure) => setPollError(failure.message),
      });
    };
    follow().catch((failure: unknown) => {
      if (!controller.signal.aborted) setPollError(messageOf(failure, "The batch can't be refreshed"));
    });
    return () => controller.abort();
  }, [batchId, initial, query.status, query.page, refreshes]);

  async function act(action: BatchAction, run: () => Promise<unknown>, fallback: string) {
    setPending(action);
    setActionError(null);
    setRefusal(null);
    try {
      await run();
    } catch (failure) {
      if (failure instanceof AuthRequestError && (failure.status === 402 || failure.status === 429)) {
        setRefusal({ status: failure.status, message: failure.message });
      } else {
        setActionError(messageOf(failure, fallback));
      }
    } finally {
      setPending(null);
      setRefreshes((count) => count + 1);
    }
  }

  return {
    view,
    query,
    pollError,
    pending,
    actionError,
    refusal,
    refused,
    showStatus: (status: IngestItemStatus | null) => setQuery({ status, page: 1 }),
    showPage: (page: number) => setQuery((current) => ({ ...current, page })),
    refresh: () => setRefreshes((count) => count + 1),
    cancel: () => act("cancel", () => cancelBatch(batchId), "The batch couldn't be canceled"),
    submit: () => act("submit", () => submitBatch(batchId), "The batch couldn't be submitted"),
    retryFailed: () =>
      act(
        "retry-failed",
        async () => setRefused((await retryFailedItems(batchId)).refused),
        "The failed designs couldn't be retried",
      ),
    retryItem: (itemId: number) =>
      act(`retry-${itemId}`, () => retryItem(batchId, itemId), "The design couldn't be retried"),
  };
}

export type BatchViewState = ReturnType<typeof useBatchView>;
