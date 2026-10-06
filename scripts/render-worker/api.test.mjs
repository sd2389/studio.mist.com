import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError, createApiClient, JobLostError } from "./api.mjs";

const WORKER_TOKEN = "worker-secret";
const CLAIM = { job_id: 7, job_token: "job-secret", kind: "still", lease_seconds: 120, heartbeat_seconds: 20 };

/**
 * A server that records every request and answers from `respond(request, body)` →
 * `{ status, json?, body?, headers? }`; one for the API, another (another origin) for storage.
 */
async function fakeServer(respond) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const parts = [];
    request.on("data", (part) => parts.push(part));
    request.on("end", () => {
      const body = Buffer.concat(parts);
      const seen = { method: request.method, url: request.url, headers: request.headers, rawHeaders: request.rawHeaders, body };
      requests.push(seen);
      const { status = 200, json, body: raw, headers = {} } = respond(seen, requests.length) ?? {};
      if (json !== undefined) {
        response.writeHead(status, { "Content-Type": "application/json", ...headers });
        response.end(JSON.stringify(json));
      } else {
        response.writeHead(status, headers);
        response.end(raw ?? "");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Header names a request carried, as sent (lower-cased), less those Node's HTTP client always adds. */
const sentHeaderNames = (request) =>
  request.rawHeaders.filter((_, index) => index % 2 === 0).map((name) => name.toLowerCase()).filter((name) => !["host", "connection"].includes(name)).sort();

let servers = [];
let dir;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "api-test-"));
});

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers = [];
  await rm(dir, { recursive: true, force: true });
});

async function serve(respond) {
  const server = await fakeServer(respond);
  servers.push(server);
  return server;
}

const client = (apiUrl, options = {}) => createApiClient({ baseUrl: apiUrl, workerToken: WORKER_TOKEN, retryDelayMs: 1, ...options });

describe("claims", () => {
  it("claims with the worker token and the kinds; 204 is nothing to do", async () => {
    const api = await serve((_request, count) => (count === 1 ? { json: CLAIM } : { status: 204 }));
    const worker = client(api.url);

    expect(await worker.claim({ workerId: "gpu-a-0", kinds: ["still", "angle_set"] })).toEqual(CLAIM);
    expect(await worker.claim({ workerId: "gpu-a-0", kinds: ["still"] })).toBeNull();

    const [first] = api.requests;
    expect(first.method).toBe("POST");
    expect(first.url).toBe("/render-jobs/claim");
    expect(first.headers["x-worker-token"]).toBe(WORKER_TOKEN);
    expect(first.headers["x-job-token"]).toBeUndefined();
    expect(JSON.parse(first.body)).toEqual({ worker_id: "gpu-a-0", kinds: ["still", "angle_set"] });
  });

  it("resolves routes under a RENDER_API_URL with a path", async () => {
    const api = await serve(() => ({ status: 204 }));
    await client(`${api.url}/api/`).claim({ workerId: "w-0", kinds: ["still"] });
    expect(api.requests[0].url).toBe("/api/render-jobs/claim");
  });
});

describe("retries", () => {
  it("tries again after a 503 or a 429, then succeeds", async () => {
    const api = await serve((_request, count) => (count === 1 ? { status: 503, json: { detail: "busy" } } : count === 2 ? { status: 429 } : { json: CLAIM }));
    expect(await client(api.url).claim({ workerId: "w-0", kinds: ["still"] })).toEqual(CLAIM);
    expect(api.requests).toHaveLength(3);
  });

  it("tries again when the network fails, and gives up after its attempts", async () => {
    const api = await serve(() => ({ status: 204 }));
    const closed = api.url.replace(/:\d+$/, ":1");
    let calls = 0;
    const flaky = (url, init) => (calls++ < 2 ? fetch(`${closed}/render-jobs/claim`, init) : fetch(url, init));
    expect(await client(api.url, { fetch: flaky }).claim({ workerId: "w-0", kinds: ["still"] })).toBeNull();
    expect(calls).toBe(3);

    await expect(client(closed, { attempts: 2 }).claim({ workerId: "w-0", kinds: ["still"] })).rejects.toThrow(ApiError);
  });

  it("does not retry what another try can't change", async () => {
    const api = await serve(() => ({ status: 401, json: { detail: "Invalid worker token" } }));
    await expect(client(api.url).claim({ workerId: "w-0", kinds: ["still"] })).rejects.toMatchObject({ status: 401, name: "ApiError" });
    expect(api.requests).toHaveLength(1);
  });
});

describe("a job's calls", () => {
  it("send the job's token, and only it", async () => {
    const api = await serve(() => ({ json: { lease_expires_at: "2026-10-05T12:00:00Z", cancel: false } }));
    const job = client(api.url).job(CLAIM);
    await job.heartbeat({ progress: 0.5, stage: "rendering" });
    const [beat] = api.requests;
    expect(beat.url).toBe("/render-jobs/7/heartbeat");
    expect(beat.headers["x-job-token"]).toBe("job-secret");
    expect(beat.headers["x-worker-token"]).toBeUndefined();
    expect(beat.url).not.toContain("job-secret");
    expect(JSON.parse(beat.body)).toEqual({ progress: 0.5, stage: "rendering" });
  });

  // The API took the job back: a lapsed lease (401), a job no longer running (409), one gone (404).
  it.each([401, 404, 409])("drops the job on a %i", async (status) => {
    const api = await serve(() => ({ status, json: { detail: "Invalid job token" } }));
    const job = client(api.url).job(CLAIM);
    for (const callJob of [() => job.payload(), () => job.heartbeat({ progress: 0, stage: "loading" }), () => job.complete({}), () => job.fail({ error: "x", code: "unknown", retryable: true })]) {
      await expect(callJob()).rejects.toBeInstanceOf(JobLostError);
    }
  });

  it("keeps the job on a 400, which the caller handles", async () => {
    const api = await serve(() => ({ status: 400, json: { detail: "outputs[0].bytes: 3 declared, nothing stored" } }));
    const error = await client(api.url).job(CLAIM).complete({ outputs: [] }).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(JobLostError);
    expect(error.status).toBe(400);
    expect(error.message).toContain("nothing stored");
  });
});

describe("inputs", () => {
  it("downloads a model on an API route with the job's token", async () => {
    const api = await serve(() => ({ body: "glTF-bytes" }));
    const dest = path.join(dir, "model.glb");
    expect(await client(api.url).job(CLAIM).download({ path: "/render-jobs/7/inputs/model" }, dest)).toBe(10);
    expect(readFileSync(dest, "utf8")).toBe("glTF-bytes");
    expect(api.requests[0].headers["x-job-token"]).toBe("job-secret");
  });

  it("never sends the job's token to a storage host", async () => {
    const api = await serve(() => ({ status: 500 }));
    const storage = await serve(() => ({ body: "glTF-bytes", headers: { "Content-Type": "image/png" } }));
    const job = client(api.url).job(CLAIM);
    await job.download({ url: `${storage.url}/bucket/model.glb?X-Amz-Signature=abc` }, path.join(dir, "model.glb"));
    const background = await job.read(`${storage.url}/bucket/background.png?X-Amz-Signature=def`);

    expect(background).toEqual({ body: Buffer.from("glTF-bytes"), contentType: "image/png" });
    expect(storage.requests.map((request) => request.headers["x-job-token"])).toEqual([undefined, undefined]);
    expect(api.requests).toHaveLength(0);
  });

  it("refuses a model over the cap and keeps nothing", async () => {
    const api = await serve(() => ({ body: "x".repeat(100) }));
    const dest = path.join(dir, "model.glb");
    await expect(client(api.url).job(CLAIM).download({ path: "/render-jobs/7/inputs/model" }, dest, { maxBytes: 10 })).rejects.toThrow(/larger than 10 bytes/);
    expect(() => readFileSync(dest)).toThrow();
  });

  it("drops the job when an input route answers 401, but not when the file is missing", async () => {
    const api = await serve((request) => (request.url.endsWith("/background") ? { status: 401 } : { status: 404 }));
    const job = client(api.url).job(CLAIM);
    await expect(job.read("/render-jobs/7/inputs/background")).rejects.toBeInstanceOf(JobLostError);
    const missing = await job.download({ path: "/render-jobs/7/inputs/model" }, path.join(dir, "m.glb")).catch((caught) => caught);
    expect(missing).not.toBeInstanceOf(JobLostError);
    expect(missing.status).toBe(404);
  });
});

describe("uploads", () => {
  const signed = {
    "Content-Type": "image/png",
    "Content-Length": "5",
    "Content-Disposition": 'attachment; filename="ring.png"',
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  it("PUTs to signed storage with exactly the headers the API returned, and no token", async () => {
    const api = await serve(() => ({ status: 500 }));
    const storage = await serve(() => ({ status: 200 }));
    const file = path.join(dir, "ring.png");
    writeFileSync(file, "PNG!!");
    await client(api.url).job(CLAIM).put({ name: "ring.png", key: "k", url: `${storage.url}/bucket/k?X-Amz-Signature=abc`, headers: signed }, file);

    const [put] = storage.requests;
    expect(put.method).toBe("PUT");
    expect(put.url).toBe("/bucket/k?X-Amz-Signature=abc");
    expect(put.body.toString()).toBe("PNG!!");
    expect(sentHeaderNames(put)).toEqual(Object.keys(signed).map((name) => name.toLowerCase()).sort());
    for (const [name, value] of Object.entries(signed)) expect(put.headers[name.toLowerCase()]).toBe(value);
  });

  it("PUTs through the API on local storage, with the job's token", async () => {
    const api = await serve(() => ({ status: 204 }));
    const file = path.join(dir, "ring.png");
    writeFileSync(file, "PNG!!");
    await client(api.url).job(CLAIM).put({ name: "ring.png", key: "k", url: "/render-jobs/7/uploads/ring.png", headers: { "Content-Type": "image/png", "Content-Length": "5" } }, file);

    const [put] = api.requests;
    expect(put.url).toBe("/render-jobs/7/uploads/ring.png");
    expect(put.headers["x-job-token"]).toBe("job-secret");
    expect(sentHeaderNames(put)).toEqual(["content-length", "content-type", "x-job-token"]);
  });

  it("says why storage refused a PUT, and drops the job when the API does with 409", async () => {
    const api = await serve(() => ({ status: 409, body: "Job is in state 'canceled'" }));
    const storage = await serve(() => ({ status: 403, body: "<Error><Code>SignatureDoesNotMatch</Code></Error>" }));
    const file = path.join(dir, "ring.png");
    writeFileSync(file, "PNG!!");
    const job = client(api.url).job(CLAIM);
    await expect(job.put({ url: `${storage.url}/k`, headers: signed }, file)).rejects.toMatchObject({ status: 403, name: "ApiError" });
    await expect(job.put({ url: "/render-jobs/7/uploads/ring.png", headers: signed }, file)).rejects.toBeInstanceOf(JobLostError);
  });
});
