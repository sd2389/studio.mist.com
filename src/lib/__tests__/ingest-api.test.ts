import { afterEach, describe, expect, it, vi } from "vitest";

const upstreamFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
let apiFlags: Record<string, boolean> = {};

// The real relay and error reading; only the API is stubbed, `/features` included.
vi.mock("@/lib/auth/upstream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/upstream")>()),
  upstreamFetch: (path: string, init?: RequestInit) =>
    path === "/features" ? Promise.resolve(Response.json({ flags: apiFlags })) : upstreamFetch(path, init),
}));

const ingest = await import("@/lib/api/ingest");
const batchesRoute = await import("@/app/api/ingest/batches/route");
const skuCheckRoute = await import("@/app/api/ingest/sku-check/route");
const batchRoute = await import("@/app/api/ingest/batches/[id]/route");
const itemsRoute = await import("@/app/api/ingest/batches/[id]/items/route");
const uploadsRoute = await import("@/app/api/ingest/batches/[id]/uploads/route");
const uploadedRoute = await import("@/app/api/ingest/batches/[id]/uploaded/route");
const submitRoute = await import("@/app/api/ingest/batches/[id]/submit/route");
const retryFailedRoute = await import("@/app/api/ingest/batches/[id]/retry-failed/route");
const retryItemRoute = await import("@/app/api/ingest/batches/[id]/items/[itemId]/retry/route");
const cancelRoute = await import("@/app/api/ingest/batches/[id]/cancel/route");

const BODY = { name: "Autumn rings", items: [{ filename: "rings/R-1.stl", bytes: 1000 }], manifest: null };
const PROBLEMS = [
  { item: 0, row: 2, field: "sku", code: "sku_taken", message: "R-1 is a scene's SKU already." },
  { item: null, row: 3, field: "file", code: "file_not_in_batch", message: "No file of the batch is gone.stl." },
];

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function post(url: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve(values) };
}

afterEach(() => {
  upstreamFetch.mockReset();
  apiFlags = {};
  vi.restoreAllMocks();
});

describe("ingest client", () => {
  it("makes a batch through its proxy with an Idempotency-Key, the caller's when it has one", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer({ id: 31, items: [] }, 201));

    await ingest.createBatch(BODY, { idempotencyKey: "drop-1" });
    await ingest.createBatch(BODY);

    const keys = fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(fetch).toHaveBeenCalledWith("/api/ingest/batches", expect.objectContaining({ method: "POST", body: JSON.stringify(BODY) }));
    expect(keys[0]).toBe("drop-1");
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reads the problems of a refused batch, one per design and CSV row", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer({ error: "The batch has 2 problems; nothing was made.", problems: PROBLEMS }, 422));

    const refused = await ingest.createBatch(BODY).catch((error: unknown) => error);

    expect(refused).toMatchObject({ status: 422, message: "The batch has 2 problems; nothing was made." });
    expect(ingest.batchProblems(refused)).toEqual(PROBLEMS);
    expect(ingest.batchProblems(new Error("offline"))).toEqual([]);
  });

  it("calls each batch endpoint's proxy with what it takes", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer({ items: [], total: 0, page: 1, limit: 100 }));

    await ingest.listBatchItems(31, { status: "failed", page: 3 });
    await ingest.checkSkus(["R-1", "R-2"]);
    await ingest.signUploads(31, [9001, 9002]);
    await ingest.confirmUploads(31, [9001]);
    await ingest.submitBatch(31);
    await ingest.retryFailedItems(31);
    await ingest.retryItem(31, 9001);
    await ingest.cancelBatch(31);
    await ingest.listBatches({ limit: 5 });

    expect(fetch.mock.calls.map(([url, init]) => [init?.method, url, init?.body ?? null])).toEqual([
      ["GET", "/api/ingest/batches/31/items?status=failed&page=3&limit=50", null],
      ["POST", "/api/ingest/sku-check", JSON.stringify({ skus: ["R-1", "R-2"] })],
      ["POST", "/api/ingest/batches/31/uploads", JSON.stringify({ item_ids: [9001, 9002] })],
      ["POST", "/api/ingest/batches/31/uploaded", JSON.stringify({ item_ids: [9001] })],
      ["POST", "/api/ingest/batches/31/submit", "{}"],
      ["POST", "/api/ingest/batches/31/retry-failed", "{}"],
      ["POST", "/api/ingest/batches/31/items/9001/retry", "{}"],
      ["POST", "/api/ingest/batches/31/cancel", "{}"],
      ["GET", "/api/ingest/batches?page=1&limit=5", null],
    ]);
  });

  it("reads every design of a status, 100 a page", async () => {
    const page = (ids: number[], total: number) => answer({ items: ids.map((id) => ({ id })), total, page: 1, limit: 100 });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => page(Array.from({ length: 100 }, (_, index) => index + 1), 130))
      .mockImplementationOnce(async () => page(Array.from({ length: 30 }, (_, index) => index + 101), 130));

    const items = await ingest.listAllBatchItems(31, "awaiting_upload");

    expect(items).toHaveLength(130);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/ingest/batches/31/items?status=awaiting_upload&limit=100",
      "/api/ingest/batches/31/items?status=awaiting_upload&page=2&limit=100",
    ]);
  });
});

describe("ingest proxies", () => {
  it("pass a new batch on with its body and Idempotency-Key, and its 422's problems back", async () => {
    apiFlags = { bulk_pipeline: true };
    upstreamFetch.mockResolvedValue(
      answer({ detail: { message: "The batch has 2 problems; nothing was made.", problems: PROBLEMS } }, 422),
    );

    const res = await batchesRoute.POST(post("http://studio.test/api/ingest/batches", BODY, { "Idempotency-Key": "drop-1" }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "The batch has 2 problems; nothing was made.", problems: PROBLEMS });
    const [path, init] = upstreamFetch.mock.calls[0]!;
    expect([path, init?.method, init?.body]).toEqual(["/ingest/batches", "POST", JSON.stringify(BODY)]);
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("drop-1");
  });

  it("pass on only the list and page filters the API takes", async () => {
    upstreamFetch.mockImplementation(async () => answer({ items: [], total: 0, page: 2, limit: 20 }));

    await batchesRoute.GET(new Request("http://studio.test/api/ingest/batches?page=2&limit=20&user_id=8"));
    await itemsRoute.GET(new Request("http://studio.test/api/ingest/batches/31/items?status=failed&page=2&secret=x"), params({ id: "31" }));

    expect(upstreamFetch.mock.calls.map(([path]) => path)).toEqual([
      "/ingest/batches?page=2&limit=20",
      "/ingest/batches/31/items?status=failed&page=2",
    ]);
  });

  it("refuse an id that isn't one before asking the API", async () => {
    const res = await batchRoute.GET(new Request("http://studio.test/api/ingest/batches/abc"), params({ id: "abc" }));
    const item = await retryItemRoute.POST(post("http://studio.test/x"), params({ id: "31", itemId: "-1" }));

    expect([res.status, item.status]).toEqual([400, 400]);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("are not there for adding work while bulk_pipeline is off, as in the API", async () => {
    apiFlags = { bulk_pipeline: false };
    const ids = params({ id: "31" });

    const answers = await Promise.all([
      batchesRoute.POST(post("http://studio.test/api/ingest/batches", BODY)),
      skuCheckRoute.POST(post("http://studio.test/api/ingest/sku-check", { skus: ["R-1"] })),
      uploadsRoute.POST(post("http://studio.test/x", { item_ids: [1] }), ids),
      uploadedRoute.POST(post("http://studio.test/x", { item_ids: [1] }), ids),
      submitRoute.POST(post("http://studio.test/x"), ids),
      retryFailedRoute.POST(post("http://studio.test/x"), ids),
      retryItemRoute.POST(post("http://studio.test/x"), params({ id: "31", itemId: "9001" })),
    ]);

    expect(answers.map((res) => res.status)).toEqual([404, 404, 404, 404, 404, 404, 404]);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("still read and cancel a batch while bulk_pipeline is off, so one in flight can be refunded", async () => {
    apiFlags = { bulk_pipeline: false };
    upstreamFetch.mockImplementation(async () => answer({ id: 31, status: "canceled" }));

    const read = await batchRoute.GET(new Request("http://studio.test/api/ingest/batches/31"), params({ id: "31" }));
    const canceled = await cancelRoute.POST(post("http://studio.test/x"), params({ id: "31" }));

    expect([read.status, canceled.status]).toEqual([200, 200]);
    expect(upstreamFetch.mock.calls.map(([path, init]) => [init?.method, path])).toEqual([
      ["GET", "/ingest/batches/31"],
      ["POST", "/ingest/batches/31/cancel"],
    ]);
  });

  it("pass each piece of work on with the flag on", async () => {
    apiFlags = { bulk_pipeline: true };
    upstreamFetch.mockImplementation(async () => answer({}));
    const ids = params({ id: "31" });

    await skuCheckRoute.POST(post("http://studio.test/x", { skus: ["R-1"] }));
    await uploadsRoute.POST(post("http://studio.test/x", { item_ids: [9001] }), ids);
    await uploadedRoute.POST(post("http://studio.test/x", { item_ids: [9001] }), ids);
    await submitRoute.POST(post("http://studio.test/x"), ids);
    await retryFailedRoute.POST(post("http://studio.test/x"), ids);
    await retryItemRoute.POST(post("http://studio.test/x"), params({ id: "31", itemId: "9001" }));

    expect(upstreamFetch.mock.calls.map(([path, init]) => [path, init?.body ?? null])).toEqual([
      ["/ingest/sku-check", JSON.stringify({ skus: ["R-1"] })],
      ["/ingest/batches/31/uploads", JSON.stringify({ item_ids: [9001] })],
      ["/ingest/batches/31/uploaded", JSON.stringify({ item_ids: [9001] })],
      ["/ingest/batches/31/submit", null],
      ["/ingest/batches/31/retry-failed", null],
      ["/ingest/batches/31/items/9001/retry", null],
    ]);
  });

  it("relay a 402 and a 429 with the API's own words", async () => {
    apiFlags = { bulk_pipeline: true };
    upstreamFetch
      .mockResolvedValueOnce(answer({ detail: "Bulk upload is part of Grow and Studio, not Free." }, 402))
      .mockResolvedValueOnce(answer({ detail: "At most 3 batches can be open at once: finish or cancel one first." }, 429));

    const free = await batchesRoute.POST(post("http://studio.test/x", BODY));
    const full = await batchesRoute.POST(post("http://studio.test/x", BODY));

    expect([free.status, await free.json()]).toEqual([402, { error: "Bulk upload is part of Grow and Studio, not Free." }]);
    expect([full.status, await full.json()]).toEqual([429, { error: "At most 3 batches can be open at once: finish or cancel one first." }]);
  });
});
