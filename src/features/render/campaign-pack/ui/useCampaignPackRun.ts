"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PackProgress } from "../engine/runner";
import { runStudioCampaignPack, type PackRunResult, type StudioPackInput } from "../engine/start-pack";

export type PackRunState =
  | { status: "idle" }
  | { status: "running"; progress: PackProgress }
  | { status: "done"; result: PackRunResult; url: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

const PROGRESS_INTERVAL_MS = 120;

const STARTING: PackProgress = {
  fraction: 0,
  label: "Preparing renderer",
  filesWritten: 0,
  failures: 0,
  elapsedMs: 0,
  etaMs: null,
};

export function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

/** Runs one pack at a time, throttles progress for React, and owns the ZIP object URL. */
export function useCampaignPackRun() {
  const [state, setState] = useState<PackRunState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const lastEmitRef = useRef(0);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const start = useCallback(
    async (input: Omit<StudioPackInput, "signal" | "onProgress">) => {
      controllerRef.current?.abort();
      revokeUrl();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: "running", progress: STARTING });
      const onProgress = (progress: PackProgress) => {
        const now = performance.now();
        if (progress.fraction < 1 && now - lastEmitRef.current < PROGRESS_INTERVAL_MS) return;
        lastEmitRef.current = now;
        if (!controller.signal.aborted) setState({ status: "running", progress });
      };
      try {
        const result = await runStudioCampaignPack({ ...input, signal: controller.signal, onProgress });
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(result.zip);
        urlRef.current = url;
        triggerDownload(url, result.zipName);
        setState({ status: "done", result, url });
      } catch (error) {
        if (isAbort(error)) setState({ status: "cancelled" });
        else setState({ status: "error", message: error instanceof Error ? error.message : "Campaign pack failed" });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [revokeUrl],
  );

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    revokeUrl();
    setState({ status: "idle" });
  }, [revokeUrl]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      revokeUrl();
    },
    [revokeUrl],
  );

  return { state, start, cancel, reset };
}
