import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/*
 * The render worker's side of the API (ADR 0005, "Endpoints for workers"; README "Server
 * renders"). The worker's Node process makes every call: claims with X-Worker-Token, everything
 * else with the job's own token in X-Job-Token, which goes to the API's origin only, never to a
 * storage host. Network errors and 429/5xx answers are retried with a backoff.
 */

const JSON_TIMEOUT_MS = 30_000;
const TRANSFER_TIMEOUT_MS = 10 * 60_000;
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
/** A model is at most the API's upload cap (MAX_UPLOAD_BYTES, 100 MB by default); this is ample. */
export const MAX_MODEL_BYTES = 1024 * 1024 * 1024;
/** A background image, or anything else the page asks for through a job-token route. */
const MAX_INPUT_BYTES = 64 * 1024 * 1024;

export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The API took the job back: a 401 (the lease lapsed and the job was claimed again), a 409 (it
 * is no longer running: canceled, completed or ended) or a 404. Drop it; don't report it.
 */
export class JobLostError extends ApiError {
  constructor(message, status) {
    super(message, status);
    this.name = "JobLostError";
  }
}

const defaultSleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });

async function detailOf(response) {
  const text = await response.text().catch(() => "");
  try {
    const { detail } = JSON.parse(text);
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  } catch {
    return text.slice(0, 200);
  }
}

/** Counts the bytes on their way through (`meter.bytes`), and fails past `limit`. */
function byteMeter(limit, label) {
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      meter.bytes += chunk.length;
      done(meter.bytes > limit ? new ApiError(`${label} is larger than ${limit} bytes`) : null, chunk);
    },
  });
  meter.bytes = 0;
  return meter;
}

/** One PUT with exactly `headers` (Node adds only Host and Connection), streaming the file. */
function putFile(url, headers, filePath, signal) {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, { method: "PUT", headers, signal, timeout: TRANSFER_TIMEOUT_MS }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new ApiError(`PUT ${url.host}: timed out`)));
    request.on("error", reject);
    pipeline(createReadStream(filePath), request).catch(reject);
  });
}

/**
 * @param {object} options
 * @param {string} options.baseUrl RENDER_API_URL.
 * @param {string} options.workerToken RENDER_WORKER_TOKEN.
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.attempts] Tries per call, the first included.
 * @param {number} [options.retryDelayMs] The first backoff; it doubles each try.
 */
export function createApiClient({ baseUrl, workerToken, fetch = globalThis.fetch, attempts = 4, retryDelayMs = 500, sleep = defaultSleep }) {
  const base = new URL(baseUrl);
  const prefix = base.pathname.replace(/\/+$/, "");
  /** A route of the API, or an absolute URL as given; relative ones resolve against RENDER_API_URL. */
  const resolve = (target) => (/^https?:\/\//i.test(target) ? new URL(target) : new URL(`${prefix}${target}`, base));
  const isApi = (url) => url.origin === base.origin;

  /** Sends a request, again after a backoff while the network fails or the API answers 429 or 5xx. */
  async function send(url, init, { timeoutMs = JSON_TIMEOUT_MS, signal } = {}) {
    for (let attempt = 1; ; attempt += 1) {
      signal?.throwIfAborted();
      const signals = [AbortSignal.timeout(timeoutMs), signal].filter(Boolean);
      let response;
      try {
        response = await fetch(url, { ...init, signal: AbortSignal.any(signals) });
      } catch (error) {
        if (signal?.aborted || attempt >= attempts) throw signal?.reason ?? new ApiError(`${init.method ?? "GET"} ${url.pathname}: ${error.cause?.code ?? error.message}`);
        await sleep(retryDelayMs * 2 ** (attempt - 1), signal);
        continue;
      }
      if (!RETRY_STATUSES.has(response.status) || attempt >= attempts) return response;
      await response.arrayBuffer().catch(() => {});
      await sleep(retryDelayMs * 2 ** (attempt - 1), signal);
    }
  }

  /** A JSON call; null for 204. A job's call that finds the job gone throws JobLostError. */
  async function call(method, route, { body, headers = {}, jobToken = null, signal } = {}) {
    const init = {
      method,
      headers: { Accept: "application/json", ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    if (jobToken) init.headers["X-Job-Token"] = jobToken;
    const response = await send(resolve(route), init, { signal });
    if (response.status === 204) return null;
    if (response.ok) return response.json();
    const message = `${method} ${route}: ${response.status} ${await detailOf(response)}`;
    if (jobToken && [401, 404, 409].includes(response.status)) throw new JobLostError(message, response.status);
    throw new ApiError(message, response.status);
  }

  return {
    /** The next job of `kinds` with its token and lease, or null when there is none (204). */
    claim: ({ workerId, kinds }, signal) =>
      call("POST", "/render-jobs/claim", { body: { worker_id: workerId, kinds }, headers: { "X-Worker-Token": workerToken }, signal }),

    /** The calls of one claimed job, all with its token. */
    job(claim) {
      const id = claim.job_id;
      const token = claim.job_token;
      const route = (rest) => `/render-jobs/${id}${rest}`;
      /** The job's token, for the API's own origin only. */
      const tokenFor = (url) => (isApi(url) ? { "X-Job-Token": token } : {});

      /** GETs a URL the payload named: a signed one as it is, an API route with the job's token. */
      async function fetchInput(target, { maxBytes, signal }) {
        const url = resolve(target);
        const response = await send(url, { headers: tokenFor(url) }, { timeoutMs: TRANSFER_TIMEOUT_MS, signal });
        if (isApi(url) && [401, 409].includes(response.status)) {
          throw new JobLostError(`GET ${url.pathname}: ${response.status} ${await detailOf(response)}`, response.status);
        }
        if (!response.ok) throw new ApiError(`GET ${isApi(url) ? url.pathname : url.host}: ${response.status}`, response.status);
        return { response, label: isApi(url) ? url.pathname : url.host, maxBytes };
      }

      return {
        id,
        payload: (signal) => call("GET", route("/payload"), { jobToken: token, signal }),
        heartbeat: ({ progress, stage }, signal) => call("POST", route("/heartbeat"), { body: { progress, stage }, jobToken: token, signal }),
        uploads: (files, signal) => call("POST", route("/uploads"), { body: { files }, jobToken: token, signal }),
        complete: (body, signal) => call("POST", route("/complete"), { body, jobToken: token, signal }),
        fail: ({ error, code, retryable }) => call("POST", route("/fail"), { body: { error, code, retryable }, jobToken: token }),

        /** Downloads the model, `{url}` signed or `{path}` an API route, to `dest`; the bytes it took. */
        async download(source, dest, { maxBytes = MAX_MODEL_BYTES, signal } = {}) {
          const { response, label } = await fetchInput(source.url ?? source.path, { maxBytes, signal });
          const meter = byteMeter(maxBytes, label);
          try {
            await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(dest));
          } catch (error) {
            await rm(dest, { force: true });
            throw error;
          }
          return meter.bytes;
        },

        /** An input the page asked for (the look's background image), as bytes, for `route.fulfill`. */
        async read(target, { maxBytes = MAX_INPUT_BYTES, signal } = {}) {
          const { response } = await fetchInput(target, { maxBytes, signal });
          const body = Buffer.from(await response.arrayBuffer());
          if (body.length > maxBytes) throw new ApiError(`input is larger than ${maxBytes} bytes`);
          return { body, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
        },

        /**
         * PUTs one output where `uploads` said, with exactly the headers it gave (they are signed);
         * the job's token only when that is the API itself (local storage). Not retried here.
         */
        async put(target, filePath, signal) {
          const url = resolve(target.url);
          const { status, body } = await putFile(url, { ...target.headers, ...tokenFor(url) }, filePath, signal);
          if (status >= 200 && status < 300) return;
          const where = isApi(url) ? url.pathname : url.host;
          if (isApi(url) && [401, 409].includes(status)) throw new JobLostError(`PUT ${where}: ${status} ${body.slice(0, 200)}`, status);
          throw new ApiError(`PUT ${where}: ${status}`, status);
        },
      };
    },
  };
}
