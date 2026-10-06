import { pollUntil } from "@/lib/polling";
import { getRenderJob, type RenderJob } from "./render-jobs-api";

export { FIRST_POLL_MS, pollDelay, SLOWEST_POLL_MS } from "@/lib/polling";

/** A job in one of these never changes again. */
export function isJobFinished(job: Pick<RenderJob, "status">): boolean {
  return job.status === "completed" || job.status === "failed" || job.status === "canceled";
}

type PollRenderJobOptions = {
  /** Stops polling: abort when the component that shows the job unmounts. */
  signal: AbortSignal;
  /** Every fresh copy of the job, the final one included. */
  onJob: (job: RenderJob) => void;
  /** A poll that failed and will be tried again (offline, or the API is down). */
  onError?: (error: Error) => void;
};

/**
 * Polls a job until it is completed, failed or canceled: after 1 s, then less often, up to
 * every 5 s (`pollUntil`). Resolves with the final job. Rejects when `signal` aborts, and when
 * the API refuses the job; nothing reaches `onJob` after an abort.
 */
export function pollRenderJob(jobId: number, { signal, onJob, onError }: PollRenderJobOptions): Promise<RenderJob> {
  return pollUntil((polling) => getRenderJob(jobId, { signal: polling }), isJobFinished, {
    signal,
    onValue: onJob,
    onError,
  });
}
