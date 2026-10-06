import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestItem, IngestUpload } from "@/lib/api/ingest";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import type { DesignUpload } from "../domain/batch-request";
import { PutFailedError, putSignedFile, type PutSignedFile } from "./put-signed-file";
import { isTransientFailure, uploadDesigns, type UploadApi, type UploadOptions } from "./upload-queue";

function file(name: string, size: number): File {
  return new File([new Uint8Array(size)], name);
}

/** Design `id` with its CAD file, and an MTL beside it when `withMtl`. */
function design(id: number, size = 100, withMtl = false): DesignUpload {
  const files = [{ path: `rings/R-${id}.obj`, file: file(`R-${id}.obj`, size) }];
  if (withMtl) files.push({ path: `rings/R-${id}.mtl`, file: file(`R-${id}.mtl`, 7) });
  return { itemId: id, files };
}

/** The headers the API signs into a URL (backend/app/core/storage presign_upload). */
function signedHeaders(name: string, size: number): Record<string, string> {
  return {
    "Content-Type": "application/octet-stream",
    "Content-Length": String(size),
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, max-age=0",
  };
}

function confirmedItem(id: number): IngestItem {
  return { id, status: "uploaded" } as IngestItem;
}

/** The API, signing every file of the designs asked for with a fresh signature each call. */
function fakeApi(designs: DesignUpload[], overrides: Partial<UploadApi> = {}) {
  const signCalls: number[][] = [];
  const confirmCalls: number[][] = [];
  let signature = 0;
  const byId = new Map(designs.map((one) => [one.itemId, one]));
  const api: UploadApi = {
    sign: async (ids) => {
      signCalls.push([...ids]);
      signature += 1;
      const files: IngestUpload[] = ids.flatMap((id) =>
        byId.get(id)!.files.map(({ path, file: body }) => ({
          item_id: id,
          filename: path,
          url: `https://r2.example.com/customers/7/ingest/31/${id}/${body.name}?sig=${signature}`,
          method: "PUT" as const,
          headers: signedHeaders(body.name, body.size),
        })),
      );
      return { files, expires_in: 900 };
    },
    confirm: async (ids) => {
      confirmCalls.push([...ids]);
      return { items: ids.map(confirmedItem), missing: [] };
    },
    ...overrides,
  };
  return { api, signCalls, confirmCalls };
}

type PutCall = { upload: IngestUpload; body: Blob };

/** Storage: each PUT takes a few milliseconds, or answers what `answer` says for it. */
function fakeStorage(answer: (call: PutCall, attempt: number) => Error | null = () => null) {
  const calls: PutCall[] = [];
  let inFlight = 0;
  let peak = 0;
  const attempts = new Map<string, number>();
  const put: PutSignedFile = async (upload, body, onProgress, signal) => {
    calls.push({ upload, body });
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 3));
      signal.throwIfAborted();
      const attempt = (attempts.get(upload.filename) ?? 0) + 1;
      attempts.set(upload.filename, attempt);
      const failure = answer({ upload, body }, attempt);
      if (failure) throw failure;
      onProgress(body.size);
    } finally {
      inFlight -= 1;
    }
  };
  return { put, calls, peak: () => peak, attempts };
}

function options(api: UploadApi, put: PutSignedFile, more: Partial<UploadOptions> = {}): UploadOptions {
  return {
    api,
    put,
    signal: new AbortController().signal,
    retryDelaysMs: [1, 1, 1, 1],
    confirmWaitMs: 60_000,
    ...more,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("uploadDesigns", () => {
  it("uploads four designs at a time, each file on its own signed URL with exactly the headers it signs", async () => {
    const designs = Array.from({ length: 10 }, (_, index) => design(index + 1, 100 + index, index === 0));
    const { api, signCalls, confirmCalls } = fakeApi(designs);
    const storage = fakeStorage();
    const progress = new Map<number, number>();

    const summary = await uploadDesigns(designs, {
      ...options(api, storage.put, { confirmChunk: 4 }),
      onProgress: (itemId, sent) => progress.set(itemId, sent),
    });

    expect(storage.peak()).toBe(4);
    expect(storage.calls).toHaveLength(11);
    for (const { upload, body } of storage.calls) {
      const sent = designs.flatMap((one) => one.files).find(({ path }) => path === upload.filename)!.file;
      expect(body).toBe(sent);
      expect(upload.method).toBe("PUT");
      expect(upload.url).toMatch(new RegExp(`/${sent.name}\\?sig=1$`));
      expect(upload.headers).toEqual(signedHeaders(sent.name, sent.size));
    }
    // One sign call for the ten (up to 25 a call); confirmations in groups of four.
    expect(signCalls).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
    expect(confirmCalls.map((ids) => ids.length)).toEqual([4, 4, 2]);
    expect(summary.confirmed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(summary.failed).toEqual([]);
    expect(progress.get(1)).toBe(100 + 7);
  });

  it("signs 25 designs a call, and signs a design again once its URL nears its expiry", async () => {
    const many = Array.from({ length: 30 }, (_, index) => design(index + 1));
    const big = fakeApi(many);
    await uploadDesigns(many, options(big.api, fakeStorage().put));
    expect(big.signCalls.map((ids) => ids.length)).toEqual([25, 5]);

    let clock = 0;
    const two = [design(1), design(2)];
    const later = fakeApi(two);
    // The first upload takes 15 minutes: the second design's URL, signed with it, has expired.
    const slow: PutSignedFile = async (upload, body, onProgress) => {
      clock += 15 * 60_000;
      onProgress(body.size);
    };
    await uploadDesigns(two, options(later.api, slow, { concurrency: 1, now: () => clock }));
    expect(later.signCalls).toEqual([[1, 2], [2]]);
  });

  it("tries transient failures again with backoff, and signs again once storage refuses a URL", async () => {
    const designs = [design(1), design(2), design(3)];
    const { api, signCalls } = fakeApi(designs);
    const storage = fakeStorage(({ upload }, attempt) => {
      if (upload.filename === "rings/R-1.obj" && attempt <= 2) return new PutFailedError(503, "Slow down");
      if (upload.filename === "rings/R-2.obj" && attempt === 1) return new PutFailedError(403, "Request has expired");
      if (upload.filename === "rings/R-3.obj" && attempt === 1) return new PutFailedError(0, "The upload was cut off.");
      return null;
    });

    const summary = await uploadDesigns(designs, options(api, storage.put));

    expect(summary.failed).toEqual([]);
    expect(Object.fromEntries(storage.attempts)).toEqual({ "rings/R-1.obj": 3, "rings/R-2.obj": 2, "rings/R-3.obj": 2 });
    expect(signCalls).toEqual([[1, 2, 3], [2]]);
    const retriedR2 = storage.calls.filter(({ upload }) => upload.filename === "rings/R-2.obj").map(({ upload }) => upload.url);
    expect(retriedR2.map((url) => url.split("?")[1])).toEqual(["sig=1", "sig=2"]);
  });

  it("fails a design storage refuses for good, or after the last retry, alone, and goes on with the rest", async () => {
    const designs = [design(1), design(2), design(3)];
    const { api, confirmCalls } = fakeApi(designs);
    const storage = fakeStorage(({ upload }) => {
      if (upload.filename === "rings/R-1.obj") return new PutFailedError(400, "Storage refused the upload (400).");
      if (upload.filename === "rings/R-2.obj") return new PutFailedError(500, "Storage refused the upload (500).");
      return null;
    });
    const failures: [number, string][] = [];

    const summary = await uploadDesigns(designs, {
      ...options(api, storage.put),
      onFailed: (itemId, message) => failures.push([itemId, message]),
    });

    expect(storage.attempts.get("rings/R-1.obj")).toBe(1);
    expect(storage.attempts.get("rings/R-2.obj")).toBe(5);
    expect(failures.sort()).toEqual([
      [1, "Storage refused the upload (400)."],
      [2, "Storage refused the upload (500)."],
    ]);
    expect(summary).toEqual({ confirmed: [3], failed: expect.arrayContaining([1, 2]) });
    expect(confirmCalls).toEqual([[3]]);
  });

  it("refuses to send a file that changed size since it was dropped", async () => {
    const one = design(1, 100);
    const { api } = fakeApi([one]);
    const failures: string[] = [];
    const changed: PutSignedFile = (upload, body, onProgress, signal) =>
      putSignedFile({ ...upload, headers: { ...upload.headers, "Content-Length": "99" } }, body, onProgress, signal);

    await uploadDesigns([one], { ...options(api, changed), onFailed: (_, message) => failures.push(message) });

    expect(failures).toEqual(["The file is 100 bytes now, not the 99 it was when it was dropped."]);
  });

  it("signs designs alone when one of them gets a group's call refused", async () => {
    const designs = [design(1), design(2), design(3)];
    const refusing = fakeApi(designs);
    const sign = refusing.api.sign;
    refusing.api.sign = async (ids, signal) => {
      refusing.signCalls.push([...ids]);
      if (ids.includes(2)) throw new AuthRequestError("Item 2 is uploaded, not awaiting its upload", 409);
      refusing.signCalls.pop();
      return sign(ids, signal);
    };
    const failures: [number, string][] = [];

    const summary = await uploadDesigns(designs, {
      ...options(refusing.api, fakeStorage().put),
      onFailed: (itemId, message) => failures.push([itemId, message]),
    });

    expect(refusing.signCalls[0]).toEqual([1, 2, 3]);
    expect(refusing.signCalls.slice(1).sort()).toEqual([[1], [2], [3]]);
    expect(failures).toEqual([[2, "Item 2 is uploaded, not awaiting its upload"]]);
    expect(summary.confirmed.sort()).toEqual([1, 3]);
  });

  it("confirms what storage holds, tries a failed confirmation again, and fails a design whose file is missing", async () => {
    const designs = [design(1), design(2)];
    let tries = 0;
    const { api, confirmCalls } = fakeApi(designs, {
      confirm: async (ids) => {
        confirmCalls.push([...ids]);
        tries += 1;
        if (tries === 1) throw new AuthRequestError("Backend unavailable", 503);
        return { items: ids.map(confirmedItem), missing: [{ item_id: 2, message: "R-2.obj is not uploaded yet." }] };
      },
    });
    const failures: [number, string][] = [];

    const summary = await uploadDesigns(designs, {
      ...options(api, fakeStorage().put),
      onFailed: (itemId, message) => failures.push([itemId, message]),
    });

    expect(confirmCalls).toHaveLength(2);
    expect(summary).toEqual({ confirmed: [1], failed: [2] });
    expect(failures).toEqual([[2, "R-2.obj is not uploaded yet."]]);
  });

  it("stops when the page is left, leaving the rest awaiting their uploads", async () => {
    const designs = Array.from({ length: 8 }, (_, index) => design(index + 1));
    const { api, confirmCalls } = fakeApi(designs);
    const storage = fakeStorage();
    const leaving = new AbortController();
    const put: PutSignedFile = (upload, body, onProgress, signal) => {
      leaving.abort(new DOMException("Left the page", "AbortError"));
      return storage.put(upload, body, onProgress, signal);
    };

    await expect(uploadDesigns(designs, options(api, put, { signal: leaving.signal }))).rejects.toThrow("Left the page");
    expect(storage.calls).toHaveLength(1);
    expect(confirmCalls).toEqual([]);
  });
});

describe("isTransientFailure", () => {
  it("tries the network, timeouts, rate limits and server errors again, not refusals", () => {
    expect([0, 408, 429, 500, 503].map((status) => isTransientFailure(new PutFailedError(status, "")))).toEqual([true, true, true, true, true]);
    expect([400, 403, 404].map((status) => isTransientFailure(new PutFailedError(status, "")))).toEqual([false, false, false]);
    expect(isTransientFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientFailure(new AuthRequestError("Rate limit exceeded", 429))).toBe(true);
    expect(isTransientFailure(new AuthRequestError("Batch is canceled", 409))).toBe(false);
  });
});

/** XMLHttpRequest as a browser has it, recording what the page asked of it. */
class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: [string, string][] = [];
  body: Blob | null = null;
  status = 0;
  aborted = false;
  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers.push([name, value]);
  }
  send(body: Blob) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  answer(status: number) {
    this.status = status;
    this.onload?.();
  }
}

describe("putSignedFile", () => {
  const body = new File(["solid ring"], "R-1.stl", { type: "model/stl" });
  const upload: IngestUpload = {
    item_id: 9001,
    filename: "rings/R-1.stl",
    url: "https://r2.example.com/customers/7/ingest/31/9001/R-1.stl?X-Amz-Signature=abc",
    method: "PUT",
    headers: signedHeaders("R-1.stl", body.size),
  };

  it("PUTs the file to its URL with every header the URL signs, the browser sending its length", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const sent: number[] = [];

    const done = putSignedFile(upload, body, (bytes) => sent.push(bytes), new AbortController().signal);
    const request = FakeXhr.last;
    request.upload.onprogress?.({ loaded: 4 });
    request.answer(200);
    await done;

    expect([request.method, request.url]).toEqual(["PUT", upload.url]);
    expect(request.headers).toEqual([
      ["Content-Type", "application/octet-stream"],
      ["Content-Disposition", 'attachment; filename="R-1.stl"'],
      ["Cache-Control", "private, max-age=0"],
    ]);
    // The file's own type would add a Content-Type the URL doesn't sign: the body goes without one.
    expect(request.body?.type).toBe("");
    expect(await request.body?.text()).toBe("solid ring");
    expect(sent).toEqual([4, body.size]);
  });

  it("rejects with storage's status, or 0 when the network failed, and aborts with the page", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);

    const refused = putSignedFile(upload, body, () => {}, new AbortController().signal);
    FakeXhr.last.answer(403);
    await expect(refused).rejects.toMatchObject({ name: "PutFailedError", status: 403 });

    const cut = putSignedFile(upload, body, () => {}, new AbortController().signal);
    FakeXhr.last.onerror?.();
    await expect(cut).rejects.toMatchObject({ status: 0 });

    const leaving = new AbortController();
    const stopped = putSignedFile(upload, body, () => {}, leaving.signal);
    leaving.abort(new DOMException("Left the page", "AbortError"));
    await expect(stopped).rejects.toThrow("Left the page");
    expect(FakeXhr.last.aborted).toBe(true);
  });

  it("sends nothing when the file isn't the size the URL signs", () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const wrong = { ...upload, headers: signedHeaders("R-1.stl", body.size + 1) };

    expect(() => putSignedFile(wrong, body, () => {}, new AbortController().signal)).toThrow(PutFailedError);
  });
});
