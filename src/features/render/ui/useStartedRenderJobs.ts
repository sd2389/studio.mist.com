"use client";

import { useState } from "react";
import { createRenderJob, createRenderJobs, type RenderJob, type RenderJobRequest } from "../lib/render-jobs-api";

function startError(error: unknown): Error {
  return error instanceof Error ? error : new Error("The export couldn't be started");
}

/**
 * The render jobs a button or dialog starts, newest first, for `StartedExportJobs` to follow and
 * download. Every start sends its own Idempotency-Key, so a request sent twice renders once and
 * a second click is a second job. The error keeps the API's status (402 for credits or plan).
 */
export function useStartedRenderJobs() {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function start(create: () => Promise<RenderJob[]>) {
    setStarting(true);
    setError(null);
    try {
      const created = await create();
      setJobs((shown) => [...created, ...shown]);
    } catch (failure) {
      setError(startError(failure));
    } finally {
      setStarting(false);
    }
  }

  return {
    jobs,
    starting,
    error,
    /** One job. */
    startJob: (request: RenderJobRequest) => start(async () => [await createRenderJob(request)]),
    /** Several jobs in one bulk request (Grow and Studio), all or none. */
    startJobs: (requests: RenderJobRequest[]) => start(() => createRenderJobs(requests)),
    /** A job started elsewhere for this list, such as a Retry. */
    add: (job: RenderJob) => setJobs((shown) => [job, ...shown]),
  };
}
