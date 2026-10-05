"use client";

import { useEffect, useState } from "react";
import { isJobFinished, pollRenderJob } from "../lib/render-job-polling";
import type { RenderJob } from "../lib/render-jobs-api";

/**
 * One render job, kept fresh until it ends: polled after 1 s, then less often, up to every
 * 5 s (`pollRenderJob`). Polling stops once the job is completed, failed or canceled, and
 * when the component unmounts. `setJob` takes a newer copy, such as the answer to a cancel.
 */
export function useRenderJob(initial: RenderJob) {
  const [job, setJob] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const jobId = job.id;
  const finished = isJobFinished(job);

  useEffect(() => {
    if (finished) return;
    const controller = new AbortController();
    pollRenderJob(jobId, {
      signal: controller.signal,
      onJob: (next) => {
        setJob(next);
        setError(null);
      },
      onError: (pollError) => setError(pollError.message),
    }).catch((pollError: unknown) => {
      if (controller.signal.aborted) return;
      setError(pollError instanceof Error ? pollError.message : "This export can't be refreshed");
    });
    return () => controller.abort();
  }, [finished, jobId]);

  return { job, error, setJob };
}
