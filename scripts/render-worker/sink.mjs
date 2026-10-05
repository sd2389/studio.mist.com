import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { once } from "node:events";
import { finished, pipeline } from "node:stream/promises";

/** The header the page sends the token in (`SINK_TOKEN_HEADER`, src/features/render/harness/job-payload.ts). */
export const SINK_TOKEN_HEADER = "x-sink-token";
/** File names the API gives outputs (OUTPUT_NAME in backend/app/schemas/render_job.py). */
const FILE_NAME = /^[A-Za-z0-9._-]{1,255}$/;
/** What the page reports; the worker adds `uploading` (and `encoding`, for video) itself. */
const PAGE_STAGES = new Set(["loading", "rendering"]);
const MAX_PROGRESS_BYTES = 1024;
/** The API's cap on one image (MAX_IMAGE_BYTES in backend/app/features/render_jobs/specs.py). */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

class SinkError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hasToken(request, token) {
  const sent = Buffer.from(String(request.headers[SINK_TOKEN_HEADER] ?? ""));
  const expected = Buffer.from(token);
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}

/** The body, or a SinkError once it passes `limit` bytes (the rest is read and dropped). */
async function readBody(request, limit) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= limit) chunks.push(chunk);
  }
  if (bytes > limit) throw new SinkError(413, `more than ${limit} bytes`);
  return Buffer.concat(chunks);
}

/**
 * Streams the body to `filePath`, hashing it on the way, and resolves once it is all on disk:
 * the response, and with it the page's next file, waits for that (backpressure). Past
 * `limit` bytes the rest is read and dropped and the file is refused.
 */
async function receiveFile(request, filePath, limit) {
  const partial = `${filePath}.part`;
  const out = createWriteStream(partial, { flags: "wx" });
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > limit) continue;
      hash.update(chunk);
      if (!out.write(chunk)) await once(out, "drain");
    }
    out.end();
    await finished(out);
  } catch (error) {
    out.destroy();
    await rm(partial, { force: true });
    throw error;
  }
  if (bytes === 0 || bytes > limit) {
    await rm(partial, { force: true });
    throw new SinkError(bytes === 0 ? 400 : 413, bytes === 0 ? "empty file" : `more than ${limit} bytes`);
  }
  await rename(partial, filePath);
  return { bytes, sha256: hash.digest("hex") };
}

function decodeName(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new SinkError(400, "the file name is not a valid URL path");
  }
}

function readProgress(body) {
  let entry;
  try {
    entry = JSON.parse(body.toString("utf8"));
  } catch {
    throw new SinkError(400, "progress is not JSON");
  }
  const { progress, stage } = entry ?? {};
  if (typeof progress !== "number" || !(progress >= 0 && progress <= 1) || !PAGE_STAGES.has(stage)) {
    throw new SinkError(400, "progress is {progress: 0 to 1, stage: loading or rendering}");
  }
  return { progress, stage };
}

async function serveModel(model, response) {
  if (Buffer.isBuffer(model)) {
    response.writeHead(200, { "Content-Type": "model/gltf-binary", "Content-Length": model.length });
    response.end(model);
    return;
  }
  const { size } = await stat(model);
  response.writeHead(200, { "Content-Type": "model/gltf-binary", "Content-Length": size });
  await pipeline(createReadStream(model), response);
}

/**
 * The loopback server one job's page writes to (ADR 0005, "Sink"). Every request needs the
 * job's random token in `X-Sink-Token`, and only the harness origin may call it from a page.
 *
 * - `GET /inputs/model.glb`: the job's model, as the worker downloaded it.
 * - `POST /files/<name>`: one encoded file, streamed to `outDir/<name>`. Only the names in
 *   `names` (the spec's `output_names`), each once; 409 for one already in.
 * - `POST /frames/<n>`: frame n of a video, raw RGBA of `frameSize`, frames in order from 0
 *   (409 otherwise); handed to `onFrame`, which B3's encoder feeds to ffmpeg.
 * - `POST /progress`: `{progress, stage}`.
 *
 * Each response goes back once its body is stored, which is what makes the page wait before the
 * next file or frame: the backpressure.
 *
 * @param {object} options
 * @param {string} options.origin The harness origin, the one page origin allowed to call.
 * @param {string | Buffer} options.model The model: a file path, or its bytes.
 * @param {string} options.outDir Where files go.
 * @param {string[] | null} [options.names] The only file names taken; any well-formed one when null.
 * @param {number} [options.maxFileBytes]
 * @param {{ width: number, height: number } | null} [options.frameSize] Takes frames of this size.
 * @param {(index: number, frame: Buffer) => Promise<void> | void} [options.onFrame]
 * @param {(entry: { progress: number, stage: string, at: number }) => void} [options.onProgress]
 */
export async function startSink({
  origin,
  model,
  outDir,
  names = null,
  maxFileBytes = MAX_FILE_BYTES,
  frameSize = null,
  onFrame = null,
  onProgress = null,
}) {
  const token = randomBytes(24).toString("hex");
  const allowed = names ? new Set(names) : null;
  /** Name → `{ path, bytes, sha256, contentType }`, in the order the page posted them. */
  const files = new Map();
  /** Every `{progress, stage, at}` the page posted, in order; `at` is ms since the sink started. */
  const progress = [];
  const startedAt = Date.now();
  /** Names whose body is still coming in, so a second post of one at once is refused too. */
  const receiving = new Set();
  let frames = 0;

  const takeFile = async (request, rawName) => {
    const name = decodeName(rawName);
    if (!FILE_NAME.test(name) || (allowed && !allowed.has(name))) throw new SinkError(400, `no file "${name}" in this job`);
    if (files.has(name) || receiving.has(name)) throw new SinkError(409, `"${name}" is in already`);
    receiving.add(name);
    try {
      const filePath = path.join(outDir, name);
      const stored = await receiveFile(request, filePath, maxFileBytes);
      files.set(name, { path: filePath, ...stored, contentType: String(request.headers["content-type"] ?? "") });
    } finally {
      receiving.delete(name);
    }
  };

  const takeFrame = async (request, index) => {
    if (!frameSize || !onFrame) throw new SinkError(404, "this job has no frames");
    if (index !== String(frames)) throw new SinkError(409, `frame ${frames} comes next`);
    const frameBytes = frameSize.width * frameSize.height * 4;
    const body = await readBody(request, frameBytes);
    if (body.length !== frameBytes) throw new SinkError(400, `a frame is ${frameBytes} bytes`);
    frames += 1;
    await onFrame(frames - 1, body);
  };

  const takeProgress = async (request) => {
    const entry = { ...readProgress(await readBody(request, MAX_PROGRESS_BYTES)), at: Date.now() - startedAt };
    progress.push(entry);
    onProgress?.(entry);
  };

  const route = async (request, response, pathname) => {
    if (request.method === "GET" && pathname === "/inputs/model.glb") return serveModel(model, response);
    if (request.method !== "POST") throw new SinkError(404, "not found");
    if (pathname.startsWith("/files/")) await takeFile(request, pathname.slice("/files/".length));
    else if (pathname.startsWith("/frames/")) await takeFrame(request, pathname.slice("/frames/".length));
    else if (pathname === "/progress") await takeProgress(request);
    else throw new SinkError(404, "not found");
    response.writeHead(204).end();
  };

  const handle = async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": `${SINK_TOKEN_HEADER}, content-type`,
        "Access-Control-Max-Age": "600",
      });
      response.end();
      return;
    }
    // A page of another origin can't use the sink, even with the token.
    if (!hasToken(request, token) || (request.headers.origin && request.headers.origin !== origin)) {
      request.resume();
      response.writeHead(403).end();
      return;
    }
    await route(request, response, new URL(request.url ?? "/", "http://sink").pathname);
  };

  const server = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
      request.resume();
      if (!response.headersSent) response.writeHead(error instanceof SinkError ? error.status : 500, { "Content-Type": "text/plain" });
      response.end(error instanceof SinkError ? error.message : "sink error");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    files,
    progress,
    /** How many frames the page has posted. */
    get frames() {
      return frames;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
