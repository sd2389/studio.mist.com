"use client";

import { useCallback, useRef, useState } from "react";
import { isAbortError } from "@/lib/video-capture";

/** Records one capture with the run's abort signal, reporting progress from 0 to 1. */
export type CaptureTask = (signal: AbortSignal, onProgress: (progress: number) => void) => Promise<void>;

/**
 * One video capture at a time: whether it runs, its progress with an ETA, a way to cancel
 * it, and the error, fallback notice or status line it leaves for the user.
 */
export function useCaptureRun() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [etaLabel, setEtaLabel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number>(0);

  /** Clears the last capture's progress and messages. */
  const reset = useCallback(() => {
    setError(null);
    setStatus(null);
    setNotice(null);
    setProgress(0);
    setEtaLabel(null);
  }, []);

  /** Aborts the capture in progress, if there is one. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  function trackProgress(p: number) {
    setProgress(p);
    const start = startedAtRef.current;
    if (p > 0.01 && start > 0) {
      const elapsed = (performance.now() - start) / 1000;
      const remaining = Math.max(0, elapsed / p - elapsed);
      setEtaLabel(`~${Math.round(remaining)}s remaining`);
    }
  }

  /** Runs `task` as the capture in progress; a cancelled run says so, a failed one shows why. */
  async function capture(task: CaptureTask) {
    const controller = new AbortController();
    abortRef.current = controller;
    startedAtRef.current = performance.now();
    setBusy(true);

    try {
      await task(controller.signal, trackProgress);
    } catch (e) {
      if (isAbortError(e)) {
        setStatus("Cancelled");
      } else {
        setError(e instanceof Error ? e.message : "Render failed");
      }
    } finally {
      setBusy(false);
      setEtaLabel(null);
      abortRef.current = null;
    }
  }

  return { busy, progress, error, status, notice, etaLabel, setProgress, setError, setStatus, setNotice, reset, cancel, capture };
}
