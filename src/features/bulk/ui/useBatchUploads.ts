"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IngestItem } from "@/lib/api/ingest";
import type { DesignUpload } from "../domain/batch-request";
import { putSignedFile } from "../lib/put-signed-file";
import { batchUploadApi, uploadDesigns, type UploadSummary } from "../lib/upload-queue";

/** Progress reaches the page at most this often, however many files are on their way. */
const PROGRESS_REFRESH_MS = 200;

export type DesignUploadStatus = "waiting" | "uploading" | "stored" | "confirmed" | "failed";

export type DesignUploadState = {
  status: DesignUploadStatus;
  /** Its CAD file's path. */
  path: string;
  sent: number;
  total: number;
  /** Why it didn't upload. */
  message?: string;
  /** The design as the API confirmed it. */
  item?: IngestItem;
};

export type UploadTotals = { sent: number; total: number; confirmed: number; failed: number; designs: number };

export function uploadTotals(states: ReadonlyMap<number, DesignUploadState>): UploadTotals {
  const totals: UploadTotals = { sent: 0, total: 0, confirmed: 0, failed: 0, designs: states.size };
  for (const state of states.values()) {
    totals.sent += state.sent;
    totals.total += state.total;
    if (state.status === "confirmed") totals.confirmed += 1;
    if (state.status === "failed") totals.failed += 1;
  }
  return totals;
}

function designSize(design: DesignUpload): number {
  return design.files.reduce((total, { file }) => total + file.size, 0);
}

/**
 * A batch's uploads from this page (`uploadDesigns`), each design's progress kept by its item
 * id. Leaving the page stops them (the browser asks first while they run): the designs not yet
 * confirmed stay awaiting their uploads, to be dropped again on the batch's page.
 */
export function useBatchUploads() {
  const [states, setStates] = useState<ReadonlyMap<number, DesignUploadState>>(new Map());
  const [running, setRunning] = useState(false);
  const live = useRef(new Map<number, DesignUploadState>());
  const refresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef<AbortController | null>(null);

  const publish = useCallback(() => {
    if (refresh.current) clearTimeout(refresh.current);
    refresh.current = null;
    setStates(new Map(live.current));
  }, []);

  const update = useCallback(
    (itemId: number, patch: Partial<DesignUploadState>) => {
      const current = live.current.get(itemId);
      if (!current) return;
      live.current.set(itemId, { ...current, ...patch });
      refresh.current ??= setTimeout(publish, PROGRESS_REFRESH_MS);
    },
    [publish],
  );

  /** Uploads designs of a batch; null when the page stopped them first. */
  const start = useCallback(
    async (batchId: number, designs: DesignUpload[]): Promise<UploadSummary | null> => {
      run.current?.abort();
      const controller = new AbortController();
      run.current = controller;
      for (const design of designs) {
        live.current.set(design.itemId, {
          status: "waiting",
          path: design.files[0]?.path ?? "",
          sent: 0,
          total: designSize(design),
        });
      }
      publish();
      setRunning(true);
      try {
        return await uploadDesigns(designs, {
          api: batchUploadApi(batchId),
          put: putSignedFile,
          signal: controller.signal,
          onProgress: (itemId, sent) => update(itemId, { status: "uploading", sent }),
          onStored: (itemId) => update(itemId, { status: "stored" }),
          onConfirmed: (item) => update(item.id, { status: "confirmed", item, message: undefined }),
          onFailed: (itemId, message) => update(itemId, { status: "failed", sent: 0, message }),
        });
      } catch (error) {
        if (controller.signal.aborted) return null;
        throw error;
      } finally {
        if (run.current === controller) {
          run.current = null;
          setRunning(false);
        }
        publish();
      }
    },
    [publish, update],
  );

  // Leaving the page pauses the batch.
  useEffect(() => () => run.current?.abort(), []);

  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  return { states, running, start, totals: uploadTotals(states) };
}

export type BatchUploads = ReturnType<typeof useBatchUploads>;
