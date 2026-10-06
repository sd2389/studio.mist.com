import { AuthRequestError } from "@/lib/auth/is-auth-required-error";

export const FIRST_POLL_MS = 1000;
export const SLOWEST_POLL_MS = 5000;
const POLL_BACKOFF = 1.5;

/** The wait before poll number `poll` (0 first): 1 s, then half as long again each time, up to 5 s. */
export function pollDelay(poll: number): number {
  return Math.min(SLOWEST_POLL_MS, Math.round(FIRST_POLL_MS * POLL_BACKOFF ** poll));
}

/** Resolves after `ms`, or rejects with the abort reason as soon as `signal` aborts. */
export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
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

/**
 * The API refused the request on its merits (the thing is gone, isn't the caller's, or can't
 * be done): asking again won't help. Rate limits (429), server errors and network failures can.
 */
export function isRefusal(error: unknown): boolean {
  return error instanceof AuthRequestError && error.status >= 400 && error.status < 500 && error.status !== 429;
}

type PollUntilOptions<T> = {
  /** Stops polling: abort when the component that shows the value unmounts. */
  signal: AbortSignal;
  /** Every fresh copy, the final one included. */
  onValue: (value: T) => void;
  /** A poll that failed and will be tried again (offline, or the API is down). */
  onError?: (error: Error) => void;
};

/**
 * Loads a value until `isDone` says it won't change again: after 1 s, then less often, up to
 * every 5 s. Resolves with the final value. Rejects when `signal` aborts, and when the API
 * refuses the request; nothing reaches `onValue` after an abort.
 */
export async function pollUntil<T>(
  load: (signal: AbortSignal) => Promise<T>,
  isDone: (value: T) => boolean,
  { signal, onValue, onError }: PollUntilOptions<T>,
): Promise<T> {
  for (let poll = 0; ; poll += 1) {
    await waitFor(pollDelay(poll), signal);
    let value: T;
    try {
      value = await load(signal);
    } catch (error) {
      signal.throwIfAborted();
      if (isRefusal(error)) throw error;
      onError?.(error instanceof Error ? error : new Error(String(error)));
      continue;
    }
    signal.throwIfAborted();
    onValue(value);
    if (isDone(value)) return value;
  }
}
