import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import { getRenderJob, type RenderJob } from "./render-jobs-api";

export const FIRST_POLL_MS = 1000;
export const SLOWEST_POLL_MS = 5000;
const POLL_BACKOFF = 1.5;

/** A job in one of these never changes again. */
export function isJobFinished(job: Pick<RenderJob, "status">): boolean {
  return job.status === "completed" || job.status === "failed" || job.status === "canceled";
}

/** The wait before poll number `poll` (0 first): 1 s, then half as long again each time, up to 5 s. */
export function pollDelay(poll: number): number {
  return Math.min(SLOWEST_POLL_MS, Math.round(FIRST_POLL_MS * POLL_BACKOFF ** poll));
}

/** Resolves after `ms`, or rejects with the abort reason as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** The API refused the job itself (gone, or no longer the caller's): asking again won't help. */
function isRefusal(error: unknown): boolean {
  return error instanceof AuthRequestError && error.status >= 400 && error.status < 500 && error.status !== 429;
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
 * every 5 s. Resolves with the final job. Rejects when `signal` aborts, and when the API
 * refuses the job; nothing reaches `onJob` after an abort.
 */
export async function pollRenderJob(
  jobId: number,
  { signal, onJob, onError }: PollRenderJobOptions,
): Promise<RenderJob> {
  for (let poll = 0; ; poll += 1) {
    await wait(pollDelay(poll), signal);
    let job: RenderJob;
    try {
      job = await getRenderJob(jobId, { signal });
    } catch (error) {
      signal.throwIfAborted();
      if (isRefusal(error)) throw error;
      onError?.(error instanceof Error ? error : new Error(String(error)));
      continue;
    }
    signal.throwIfAborted();
    onJob(job);
    if (isJobFinished(job)) return job;
  }
}
