import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import { pollDelay, pollRenderJob } from "./render-job-polling";
import type { RenderJob, RenderJobStatus } from "./render-jobs-api";

function renderJob(status: RenderJobStatus, progress = 0): RenderJob {
  return {
    id: 7,
    kind: "still",
    status,
    scene_id: 812,
    batch_id: null,
    spec: { width: 3840, height: 2160, format: "png", frames: 1, output_names: ["solitaire.png"] },
    look: null,
    variant_id: null,
    name: null,
    watermark: false,
    credits: 2,
    credit_state: status === "completed" ? "charged" : "held",
    progress,
    stage: status === "running" ? "rendering" : null,
    attempts: status === "queued" ? 0 : 1,
    error: null,
    error_code: null,
    cancel_requested_at: null,
    outputs: [],
    created_at: "2026-10-03T14:02:11Z",
    started_at: null,
    finished_at: null,
  };
}

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** The API answers each poll with the next of `answers`, then keeps repeating the last. */
function apiAnswers(...answers: Array<() => Response>) {
  let poll = 0;
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => answers[Math.min(poll++, answers.length - 1)]());
}

describe("pollDelay", () => {
  it("waits 1 s, then half as long again each poll, up to every 5 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(pollDelay)).toEqual([1000, 1500, 2250, 3375, 5000, 5000, 5000]);
  });
});

describe("pollRenderJob", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls less often as it goes, and stops once the job ends", async () => {
    const fetch = apiAnswers(
      () => answer(renderJob("queued")),
      () => answer(renderJob("running", 0.25)),
      () => answer(renderJob("running", 0.75)),
      () => answer(renderJob("completed", 1)),
    );
    const seen: string[] = [];
    const done = pollRenderJob(7, {
      signal: new AbortController().signal,
      onJob: (job) => seen.push(`${job.status} ${job.progress}`),
    });

    for (const [wait, polls] of [[999, 0], [1, 1], [1499, 1], [1, 2], [2250, 3], [3375, 4]] as const) {
      await vi.advanceTimersByTimeAsync(wait);
      expect(fetch).toHaveBeenCalledTimes(polls);
    }
    await expect(done).resolves.toMatchObject({ id: 7, status: "completed" });
    expect(seen).toEqual(["queued 0", "running 0.25", "running 0.75", "completed 1"]);
    expect(fetch).toHaveBeenLastCalledWith("/api/render-jobs/7", expect.objectContaining({ method: "GET" }));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("stops when the component unmounts: its effect aborts the poll", async () => {
    const fetch = apiAnswers(() => answer(renderJob("running", 0.5)));
    const unmount = new AbortController();
    const onJob = vi.fn();
    const done = pollRenderJob(7, { signal: unmount.signal, onJob }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(2500);
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount.abort();

    expect(await done).toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onJob).toHaveBeenCalledTimes(2);
  });

  it("drops an answer that arrives after the unmount", async () => {
    let reply: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => (reply = resolve)));
    const unmount = new AbortController();
    const onJob = vi.fn();
    const done = pollRenderJob(7, { signal: unmount.signal, onJob }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1000);
    unmount.abort();
    reply(answer(renderJob("completed", 1)));

    expect(await done).toMatchObject({ name: "AbortError" });
    expect(onJob).not.toHaveBeenCalled();
  });

  it("keeps polling through a poll that failed, and says why", async () => {
    apiAnswers(
      () => answer({ error: "Backend unavailable" }, 503),
      () => answer(renderJob("completed", 1)),
    );
    const onError = vi.fn();
    const done = pollRenderJob(7, { signal: new AbortController().signal, onJob: () => {}, onError });

    await vi.advanceTimersByTimeAsync(1000 + 1500);

    await expect(done).resolves.toMatchObject({ status: "completed" });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Backend unavailable" }));
  });

  it("gives up when the API refuses the job", async () => {
    const fetch = apiAnswers(() => answer({ error: "Render job not found" }, 404));
    const done = pollRenderJob(7, { signal: new AbortController().signal, onJob: () => {} }).catch(
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(1000);

    const error = await done;
    expect(error).toBeInstanceOf(AuthRequestError);
    expect(error).toMatchObject({ status: 404, message: "Render job not found" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
