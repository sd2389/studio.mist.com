import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestBatch, IngestBatchStatus } from "@/lib/api/ingest";
import { pollDelay } from "@/lib/polling";
import { pollBatch } from "./batch-polling";

function batch(status: IngestBatchStatus, converting: number): IngestBatch {
  return {
    id: 31,
    name: "Autumn rings",
    status,
    source: "studio",
    item_count: 3,
    total_bytes: 30_000,
    counts: { converting, done: 3 - converting },
    render_plan: null,
    look_template: null,
    options: {},
    quote: { model_credits: 3, render_credits: 0 },
    held: { model_credits: converting, render_credits: 0 },
    created_at: "2026-10-06T09:00:00Z",
    updated_at: "2026-10-06T09:00:00Z",
    submitted_at: "2026-10-06T09:01:00Z",
    finished_at: null,
    expires_at: null,
  };
}

const PAGE = { items: [], total: 0, page: 2, limit: 50 };

/** The API answers each poll's batch with the next of `batches`, then keeps repeating the last. */
function apiAnswers(...batches: Array<() => Response>) {
  let poll = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("/items")) return Response.json(PAGE);
    return batches[Math.min(poll++, batches.length - 1)]();
  });
}

function batchRequests(fetch: ReturnType<typeof apiAnswers>): number {
  return fetch.mock.calls.filter(([input]) => !String(input).includes("/items")).length;
}

describe("pollBatch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls a processing batch and its page of designs as a render job is polled, until it finishes", async () => {
    const fetch = apiAnswers(
      () => Response.json(batch("processing", 3)),
      () => Response.json(batch("processing", 2)),
      () => Response.json(batch("processing", 1)),
      () => Response.json(batch("completed", 0)),
    );
    const seen: string[] = [];
    const done = pollBatch(31, { status: "converting", page: 2 }, {
      signal: new AbortController().signal,
      onView: ({ batch: next }) => seen.push(`${next.status} ${next.counts.converting}`),
    });

    // The same backoff as pollRenderJob: 1 s, then half as long again each time, up to 5 s.
    expect([0, 1, 2, 3].map(pollDelay)).toEqual([1000, 1500, 2250, 3375]);
    for (const [wait, polls] of [[999, 0], [1, 1], [1499, 1], [1, 2], [2250, 3], [3375, 4]] as const) {
      await vi.advanceTimersByTimeAsync(wait);
      expect(batchRequests(fetch)).toBe(polls);
    }
    await expect(done).resolves.toMatchObject({ batch: { status: "completed" } });
    expect(seen).toEqual(["processing 3", "processing 2", "processing 1", "completed 0"]);
    expect(fetch).toHaveBeenCalledWith("/api/ingest/batches/31", expect.objectContaining({ method: "GET" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/ingest/batches/31/items?status=converting&page=2&limit=50",
      expect.objectContaining({ method: "GET" }),
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(batchRequests(fetch)).toBe(4);
  });

  it("keeps polling a finished batch while its ZIP builds, until the ZIP is ready", async () => {
    const archive = (status: "queued" | "running" | "completed") => ({
      job: { id: 5120, kind: "batch_archive", status, progress: status === "completed" ? 1 : 0.5, stage: null, attempts: 1, max_attempts: 3, error: null, error_code: null, credits: 0, credit_state: "none" as const, cancel_requested_at: null, outputs: [] },
      parts: [],
      made_at: null,
      expires_at: null,
    });
    const fetch = apiAnswers(
      () => Response.json({ ...batch("completed", 0), archive: archive("queued") }),
      () => Response.json({ ...batch("completed", 0), archive: archive("running") }),
      () => Response.json({ ...batch("completed", 0), archive: archive("completed") }),
    );
    const done = pollBatch(31, { status: null, page: 1 }, { signal: new AbortController().signal, onView: () => {} });

    await vi.advanceTimersByTimeAsync(1000 + 1500 + 2250);
    await expect(done).resolves.toMatchObject({ batch: { archive: { job: { status: "completed" } } } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(batchRequests(fetch)).toBe(3);
  });

  it("keeps polling through a failed poll, and stops once the API refuses the batch", async () => {
    apiAnswers(
      () => Response.json(batch("processing", 3)),
      () => Response.json({ error: "Backend unavailable" }, { status: 503 }),
      () => Response.json({ error: "Batch not found" }, { status: 404 }),
    );
    const errors: string[] = [];
    const done = pollBatch(31, { status: null, page: 1 }, {
      signal: new AbortController().signal,
      onView: () => {},
      onError: (error) => errors.push(error.message),
    });
    const settled = expect(done).rejects.toMatchObject({ status: 404 });

    await vi.advanceTimersByTimeAsync(1000 + 1500 + 2250);
    await settled;
    expect(errors).toEqual(["Backend unavailable"]);
  });

  it("stops at once when the page is left", async () => {
    const fetch = apiAnswers(() => Response.json(batch("processing", 3)));
    const leaving = new AbortController();
    const done = pollBatch(31, { status: null, page: 1 }, { signal: leaving.signal, onView: () => {} });
    const settled = expect(done).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(1000);
    leaving.abort();
    await settled;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(batchRequests(fetch)).toBe(1);
  });
});
