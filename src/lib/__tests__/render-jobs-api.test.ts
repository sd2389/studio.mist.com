import { afterEach, describe, expect, it, vi } from "vitest";
import type { RenderJobRequest } from "@/features/render/lib/render-jobs-api";

const upstreamFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
let apiFlags: Record<string, boolean> = {};

// The real relay and error reading; only the API is stubbed, `/features` included.
vi.mock("@/lib/auth/upstream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/upstream")>()),
  upstreamFetch: (path: string, init?: RequestInit) =>
    path === "/features" ? Promise.resolve(Response.json({ flags: apiFlags })) : upstreamFetch(path, init),
}));

const { cancelRenderJob, createRenderJob, createRenderJobs, listRenderJobs, outputDownloadUrl, quoteRenderJobs } =
  await import("@/features/render/lib/render-jobs-api");
const jobsRoute = await import("@/app/api/render-jobs/route");
const bulkRoute = await import("@/app/api/render-jobs/bulk/route");
const bulkQuoteRoute = await import("@/app/api/render-jobs/bulk/quote/route");
const jobRoute = await import("@/app/api/render-jobs/[id]/route");
const cancelRoute = await import("@/app/api/render-jobs/[id]/cancel/route");
const downloadRoute = await import("@/app/api/render-jobs/[id]/outputs/[renderId]/download/route");

const STILL: RenderJobRequest = {
  kind: "still",
  scene_id: 812,
  name: "solitaire-4K",
  spec: { camera: { view: { position: [0.62, 0.88, 2.25], target: [0, 0, 0] } }, width: 3840, height: 2160 },
};
const JOB = { id: 4812, kind: "still", status: "queued", credits: 2, credit_state: "held", outputs: [] };

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function params<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve(values) };
}

afterEach(() => {
  upstreamFetch.mockReset();
  apiFlags = {};
  vi.restoreAllMocks();
});

describe("render jobs client", () => {
  it("starts a job with an Idempotency-Key, the caller's when it has one", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer(JOB, 201));

    await createRenderJob(STILL, { idempotencyKey: "click-1" });
    await createRenderJob(STILL);

    const keys = fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(fetch).toHaveBeenCalledWith("/api/render-jobs", expect.objectContaining({ method: "POST", body: JSON.stringify(STILL) }));
    expect(keys[0]).toBe("click-1");
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("starts a bulk request with an Idempotency-Key too, a fresh one for each call", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer({ jobs: [JOB] }, 201));

    await createRenderJobs([STILL], { idempotencyKey: "batch-1" });
    await createRenderJobs([STILL]);
    await createRenderJobs([STILL]);

    const keys = fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/render-jobs/bulk",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ jobs: [STILL] }) }),
    );
    expect(keys[0]).toBe("batch-1");
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("prices a bulk request job by job through the bulk quote proxy", async () => {
    const quote = {
      credits: 2,
      items: [{ quote: { credits: 2, width: 3840, height: 2160, frames: 1, outputs: ["a.png"], watermark: false, warnings: [] }, refused: null }],
      refused: null,
      warnings: [],
    };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer(quote));

    expect(await quoteRenderJobs([STILL])).toEqual(quote);
    expect(fetch).toHaveBeenCalledWith(
      "/api/render-jobs/bulk/quote",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ jobs: [STILL] }) }),
    );
  });

  it("lists with only the filters that are set, and cancels and downloads through the proxies", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => answer({ items: [], next_before: null }));

    await listRenderJobs({ scene_id: 812, status: "running", before: undefined, limit: 20 });
    await cancelRenderJob(4812);

    expect(fetch.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`)).toEqual([
      "GET /api/render-jobs?scene_id=812&status=running&limit=20",
      "POST /api/render-jobs/4812/cancel",
    ]);
    expect(outputDownloadUrl(4812, 991)).toBe("/api/render-jobs/4812/outputs/991/download");
  });
});

describe("POST /api/render-jobs", () => {
  it("passes the body and the Idempotency-Key on, and answers with the API's status", async () => {
    apiFlags = { server_exports: true };
    upstreamFetch.mockResolvedValueOnce(answer(JOB, 201)).mockResolvedValueOnce(answer(JOB, 200));

    const created = await jobsRoute.POST(post("http://localhost/api/render-jobs", STILL, { "Idempotency-Key": "click-1" }));
    const repeated = await jobsRoute.POST(post("http://localhost/api/render-jobs", STILL, { "Idempotency-Key": "click-1" }));

    expect([created.status, repeated.status]).toEqual([201, 200]);
    expect(await created.json()).toEqual(JOB);
    const [path, init] = upstreamFetch.mock.calls[0];
    expect(path).toBe("/render-jobs");
    expect(JSON.parse(String(init?.body))).toEqual(STILL);
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("click-1");
  });

  it("starts nothing while server exports are off", async () => {
    const single = await jobsRoute.POST(post("http://localhost/api/render-jobs", STILL));
    const bulk = await bulkRoute.POST(post("http://localhost/api/render-jobs/bulk", { jobs: [STILL] }));

    expect([single.status, bulk.status]).toEqual([404, 404]);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("answers the API's refusal as { error } with its status", async () => {
    apiFlags = { server_exports: true };
    upstreamFetch.mockResolvedValue(
      answer({ detail: "Not enough render credits (2 needed). Upgrade your plan or buy a top-up." }, 402),
    );

    const res = await jobsRoute.POST(post("http://localhost/api/render-jobs", STILL));

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: "Not enough render credits (2 needed). Upgrade your plan or buy a top-up.",
    });
  });
});

describe("POST /api/render-jobs/bulk", () => {
  it("passes the Idempotency-Key on, and answers 201 for new jobs and 200 for a repeated key", async () => {
    apiFlags = { server_exports: true };
    upstreamFetch.mockResolvedValueOnce(answer({ jobs: [JOB] }, 201)).mockResolvedValueOnce(answer({ jobs: [JOB] }, 200));

    const request = () => post("http://localhost/api/render-jobs/bulk", { jobs: [STILL] }, { "Idempotency-Key": "batch-1" });
    const created = await bulkRoute.POST(request());
    const repeated = await bulkRoute.POST(request());

    expect([created.status, repeated.status]).toEqual([201, 200]);
    const [path, init] = upstreamFetch.mock.calls[0];
    expect(path).toBe("/render-jobs/bulk");
    expect(JSON.parse(String(init?.body))).toEqual({ jobs: [STILL] });
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("batch-1");
  });

  it("sends no key when the caller gave none", async () => {
    apiFlags = { server_exports: true };
    upstreamFetch.mockResolvedValue(answer({ jobs: [JOB] }, 201));

    await bulkRoute.POST(post("http://localhost/api/render-jobs/bulk", { jobs: [STILL] }));

    expect(new Headers(upstreamFetch.mock.calls[0][1]?.headers).has("Idempotency-Key")).toBe(false);
  });
});

describe("POST /api/render-jobs/bulk/quote", () => {
  it("relays each job's quote or refusal, the total and the plan's refusal", async () => {
    const quote = {
      credits: 2,
      items: [
        { quote: { credits: 2, width: 3840, height: 2160, frames: 1, outputs: ["a.png"], watermark: true, warnings: [] }, refused: null },
        { quote: null, refused: { status: 404, detail: "Variant not found" } },
      ],
      refused: { status: 402, detail: "Rendering several scenes or variants at once is part of Grow and Studio, not Free." },
      warnings: [],
    };
    upstreamFetch.mockResolvedValue(answer(quote));

    const res = await bulkQuoteRoute.POST(post("http://localhost/api/render-jobs/bulk/quote", { jobs: [STILL, STILL] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(quote);
    const [path, init] = upstreamFetch.mock.calls[0];
    expect(path).toBe("/render-jobs/bulk/quote");
    expect(JSON.parse(String(init?.body))).toEqual({ jobs: [STILL, STILL] });
  });

  it("answers the API's refusal as { error } with its status", async () => {
    upstreamFetch.mockResolvedValue(answer({ detail: "Not Found" }, 404));

    const res = await bulkQuoteRoute.POST(post("http://localhost/api/render-jobs/bulk/quote", { jobs: [STILL] }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not Found" });
  });

  it("refuses a body that isn't JSON before asking the API", async () => {
    const res = await bulkQuoteRoute.POST(
      new Request("http://localhost/api/render-jobs/bulk/quote", { method: "POST", body: "{not json" }),
    );

    expect(res.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/render-jobs", () => {
  it("passes the list filters to the API and nothing else", async () => {
    upstreamFetch.mockResolvedValue(answer({ items: [], next_before: null }));

    const res = await jobsRoute.GET(
      new Request("http://localhost/api/render-jobs?scene_id=812&status=running&before=90&limit=20&user_id=9"),
    );

    expect(res.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledWith("/render-jobs?scene_id=812&status=running&before=90&limit=20", undefined);
  });
});

describe("GET /api/render-jobs/[id] and its cancel", () => {
  it("refuses an id that is not a database id before asking the API", async () => {
    for (const id of ["0", "-1", "1.5", "7a", "99999999999"]) {
      const res = await jobRoute.GET(new Request(`http://localhost/api/render-jobs/${id}`), params({ id }));
      expect(res.status).toBe(400);
    }
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("relays one job, and a cancel that came too late", async () => {
    upstreamFetch.mockResolvedValueOnce(answer(JOB)).mockResolvedValueOnce(answer({ detail: "Job is already completed" }, 409));

    const job = await jobRoute.GET(new Request("http://localhost/api/render-jobs/4812"), params({ id: "4812" }));
    const cancel = await cancelRoute.POST(post("http://localhost/api/render-jobs/4812/cancel", {}), params({ id: "4812" }));

    expect(await job.json()).toEqual(JOB);
    expect(cancel.status).toBe(409);
    expect(await cancel.json()).toEqual({ error: "Job is already completed" });
    expect(upstreamFetch.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`)).toEqual([
      "GET /render-jobs/4812",
      "POST /render-jobs/4812/cancel",
    ]);
  });
});

describe("GET /api/render-jobs/[id]/outputs/[renderId]/download", () => {
  const url = "http://localhost/api/render-jobs/4812/outputs/991/download";
  const ids = { id: "4812", renderId: "991" };

  it("sends the browser on to the signed link without following it", async () => {
    upstreamFetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "https://files.example/solitaire.png?signature=1" } }),
    );

    const res = await downloadRoute.GET(new Request(url), params(ids));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://files.example/solitaire.png?signature=1");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(upstreamFetch).toHaveBeenCalledWith(
      "/render-jobs/4812/outputs/991/download",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("streams the file on local storage, under its download name", async () => {
    upstreamFetch.mockResolvedValue(
      new Response("PNG bytes", {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="solitaire.png"' },
      }),
    );

    const res = await downloadRoute.GET(new Request(url), params(ids));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="solitaire.png"');
    expect(await res.text()).toBe("PNG bytes");
  });

  it("answers another user's output as the API does: not found", async () => {
    upstreamFetch.mockResolvedValue(answer({ detail: "Render job not found" }, 404));

    const res = await downloadRoute.GET(new Request(url), params(ids));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Render job not found" });
  });
});
