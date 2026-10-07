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
/** The longest path a Campaign Pack's entry may have in its ZIP. */
const MAX_PATH_LENGTH = 1024;
/** What the page reports; the worker adds `encoding` (a turntable's MP4, a spin's ZIP) and `uploading` itself. */
const PAGE_STAGES = new Set(["loading", "rendering"]);
const MAX_PROGRESS_BYTES = 1024;
/** The API's cap on one image (MAX_IMAGE_BYTES in backend/app/features/render_jobs/job_files.py). */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

/**
 * A Campaign Pack's entry: a relative path in its ZIP whose every part is a file name the API
 * would give (`packPaths` in src/features/render/campaign-pack/domain/naming.ts makes them so),
 * none of them `.` or `..`.
 */
export function isEntryPath(name) {
  if (name.length > MAX_PATH_LENGTH) return false;
  return name.split("/").every((part) => FILE_NAME.test(part) && part !== "." && part !== "..");
}

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

/** A frame's bytes, whole or a part: at most the `left` bytes it still needs, or a SinkError. */
async function readFrameBytes(request, left) {
  // Refused before any of it is read, where the request says how long it is.
  if (Number(request.headers["content-length"]) > left) throw new SinkError(413, `more than the ${left} bytes the frame needs`);
  return readBody(request, left);
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

function readJson(body, what) {
  try {
    return JSON.parse(body.toString("utf8")) ?? {};
  } catch {
    throw new SinkError(400, `${what} is not JSON`);
  }
}

function readProgress(body) {
  const { progress, stage } = readJson(body, "progress");
  if (typeof progress !== "number" || !(progress >= 0 && progress <= 1) || !PAGE_STAGES.has(stage)) {
    throw new SinkError(400, "progress is {progress: 0 to 1, stage: loading or rendering}");
  }
  return { progress, stage };
}

/** A video as its page opens it (`VideoClip`, src/features/render/harness/sink-client.ts). */
function readClip(body) {
  const { width, height, fps, frames } = readJson(body, "a video");
  if (![width, height, fps, frames].every((value) => Number.isInteger(value) && value > 0)) {
    throw new SinkError(400, "a video is {width, height, fps, frames}, each a whole number");
  }
  return { width, height, fps, frames };
}

async function serveFile(file, contentType, response) {
  if (Buffer.isBuffer(file)) {
    response.writeHead(200, { "Content-Type": contentType, "Content-Length": file.length });
    response.end(file);
    return;
  }
  const { size } = await stat(file);
  response.writeHead(200, { "Content-Type": contentType, "Content-Length": size });
  await pipeline(createReadStream(file), response);
}

/**
 * The loopback server one job's page writes to (ADR 0005, "Sink"). Every request needs the
 * job's random token in `X-Sink-Token`, and only the harness origin may call it from a page.
 *
 * - `GET /inputs/model.glb`: the job's model, as the worker downloaded it.
 * - `GET /inputs/<path>`: one of `inputs`, a convert job's files (`/inputs/source`, `/inputs/companions/<n>`).
 * - `POST /files/<name>`: one encoded file, streamed to `outDir/<name>`. Only the names in
 *   `names` (the spec's `output_names`), each once; 409 for one already in. With `paths` (a
 *   Campaign Pack), a name is the file's path in the pack's ZIP (`isEntryPath`), and the file
 *   goes to `outDir/entry-<n>`, n counting the files from 0.
 * - `POST /frames/<n>`: frame n of a video, raw RGBA of `frameSize`, one at a time and in order
 *   from 0 (409 otherwise). A frame comes whole, or in parts in order, each
 *   `?offset=<its first byte>&length=<the frame's>` (the harness sends parts of at most 16 MB:
 *   DevTools copies every request body to the worker, and a whole 8K frame would not fit one
 *   message). Each part goes to `onFrameBytes`, which feeds it to ffmpeg.
 * - `POST /videos/<name>` (a Campaign Pack's turntables): `{width, height, fps, frames}` opens a
 *   video, `<name>` being its MP4's path in the ZIP. `videos.open` takes it or refuses it (400);
 *   its frames then come by `POST /frames/<n>`, of its size, from 0, and go to the `write` it
 *   answered. One video at a time.
 * - `POST /videos/<name>/end`: once all its frames are in, closes the video; `finish` stores the
 *   MP4, which is answered with `{bytes}`.
 * - `POST /progress`: `{progress, stage}`.
 *
 * Each response goes back once its body is stored, or a frame's bytes have gone to the encoder
 * (ffmpeg has them), which is what makes the page wait before the next file, frame or part: the
 * backpressure. The sink holds at most one frame's bytes. `files` holds every file in the order it
 * was stored, a pack's MP4s among them.
 *
 * @param {object} options
 * @param {string} options.origin The harness origin, the one page origin allowed to call.
 * @param {string | Buffer | null} [options.model] The model: a file path, or its bytes.
 * @param {Map<string, string> | null} [options.inputs] Path (`/inputs/…`) → the file served there.
 * @param {string} options.outDir Where files go.
 * @param {string[] | null} [options.names] The only file names taken; any well-formed one when null.
 * @param {boolean} [options.paths] Names are paths in a ZIP.
 * @param {number} [options.maxFiles] The most files (videos included) it takes.
 * @param {number} [options.maxFileBytes]
 * @param {{ width: number, height: number } | null} [options.frameSize] Takes frames of this size.
 * @param {(index: number, bytes: Buffer) => Promise<void> | void} [options.onFrameBytes] Frame `index`'s
 *   bytes, whole or a part, in order.
 * @param {{ open: (name: string, clip: { width: number, height: number, fps: number, frames: number }) =>
 *   Promise<{ write: (bytes: Buffer) => Promise<void>, finish: () => Promise<{ path: string, bytes: number, sha256: string }> }> } | null}
 *   [options.videos] Takes videos.
 * @param {(name: string, file: { path: string, bytes: number, sha256: string, contentType: string }) => void} [options.onStored]
 *   Each file, once it is stored.
 * @param {(entry: { progress: number, stage: string, at: number }) => void} [options.onProgress]
 */
export async function startSink({
  origin,
  model = null,
  inputs = null,
  outDir,
  names = null,
  paths = false,
  maxFiles = Infinity,
  maxFileBytes = MAX_FILE_BYTES,
  frameSize = null,
  onFrameBytes = null,
  videos = null,
  onStored = null,
  onProgress = null,
}) {
  const token = randomBytes(24).toString("hex");
  const allowed = names ? new Set(names) : null;
  /** Name → `{ path, bytes, sha256, contentType }`, in the order they were stored. */
  const files = new Map();
  /** Every `{progress, stage, at}` the page posted, in order; `at` is ms since the sink started. */
  const progress = [];
  const startedAt = Date.now();
  /** Names whose body is still coming in, so a second post of one at once is refused too. */
  const receiving = new Set();
  /** Files whose body has started coming in: a pack's entries are named on disk by it. */
  let started = 0;
  /** A pack's open video: its name, size and frame count, and where its bytes go. */
  let clip = null;
  /** Frames the encoder has taken whole, how much of the next is in, and whether bytes are on their way there. */
  let frames = 0;
  let frameBytesIn = 0;
  let takingFrame = false;

  /** A name the job may store a file under now: well formed, the job's, not in yet, and within the count. */
  const checkName = (name) => {
    const wellFormed = paths ? isEntryPath(name) : FILE_NAME.test(name);
    if (!wellFormed || (allowed && !allowed.has(name))) throw new SinkError(400, `no file "${name}" in this job`);
    if (files.has(name) || receiving.has(name) || clip?.name === name) throw new SinkError(409, `"${name}" is in already`);
    if (files.size + receiving.size + (clip ? 1 : 0) >= maxFiles) throw new SinkError(413, `this job makes at most ${maxFiles} files`);
  };

  const store = (name, file) => {
    files.set(name, file);
    onStored?.(name, file);
  };

  const takeFile = async (request, rawName) => {
    const name = decodeName(rawName);
    checkName(name);
    receiving.add(name);
    try {
      const filePath = path.join(outDir, paths ? `entry-${started}` : name);
      started += 1;
      const stored = await receiveFile(request, filePath, maxFileBytes);
      store(name, { path: filePath, ...stored, contentType: String(request.headers["content-type"] ?? "") });
    } finally {
      receiving.delete(name);
    }
  };

  /** Where frames go: the open video's encoder, or the turntable's. */
  const frameTarget = () => {
    if (clip?.finishing) throw new SinkError(409, `"${clip.name}" is being finished`);
    if (clip) return { width: clip.width, height: clip.height, write: (bytes) => clip.writer.write(bytes) };
    if (frameSize && onFrameBytes) return { ...frameSize, write: (bytes) => onFrameBytes(frames, bytes) };
    throw new SinkError(404, videos ? "no video is open" : "this job has no frames");
  };

  const takeFrame = async (request, index, query) => {
    const target = frameTarget();
    const frameBytes = target.width * target.height * 4;
    const isPart = query.has("offset");
    if (isPart && query.get("length") !== String(frameBytes)) throw new SinkError(400, `a frame is ${frameBytes} bytes`);
    if (takingFrame) throw new SinkError(409, `frame ${frames} is still going to the encoder`);
    if (clip && frames >= clip.frames) throw new SinkError(409, `"${clip.name}" has all its ${clip.frames} frames`);
    if (index !== String(frames)) throw new SinkError(409, `frame ${frames} comes next`);
    if ((isPart ? query.get("offset") : "0") !== String(frameBytesIn)) throw new SinkError(409, `frame ${frames} goes on from byte ${frameBytesIn}`);
    takingFrame = true;
    try {
      const bytes = await readFrameBytes(request, frameBytes - frameBytesIn);
      if (!bytes.length || (!isPart && bytes.length !== frameBytes)) throw new SinkError(400, `a frame is ${frameBytes} bytes`);
      await target.write(bytes);
      frameBytesIn += bytes.length;
      if (frameBytesIn === frameBytes) {
        frames += 1;
        frameBytesIn = 0;
      }
    } finally {
      takingFrame = false;
    }
  };

  const openVideo = async (request, name) => {
    if (clip) throw new SinkError(409, `"${clip.name}" is still open`);
    checkName(name);
    const params = readClip(await readBody(request, MAX_PROGRESS_BYTES));
    let writer;
    try {
      writer = await videos.open(name, params);
    } catch (error) {
      throw new SinkError(400, error.message);
    }
    clip = { name, ...params, writer };
    frames = 0;
    frameBytesIn = 0;
  };

  /**
   * Closes the open video once all its frames are in, and stores the MP4 its encoder made. The
   * video stays open, taking nothing more, until its encoder has finished.
   */
  const endVideo = async (name) => {
    if (clip?.name !== name || clip.finishing) throw new SinkError(409, `"${name}" is not open`);
    if (takingFrame || frames !== clip.frames) throw new SinkError(409, `"${name}" has ${frames} of its ${clip.frames} frames`);
    clip.finishing = true;
    try {
      const file = { ...(await clip.writer.finish()), contentType: "video/mp4" };
      store(name, file);
      return file.bytes;
    } finally {
      clip = null;
    }
  };

  const takeVideo = async (request, response, rest) => {
    if (!videos) throw new SinkError(404, "this job has no videos");
    if (!rest.endsWith("/end")) {
      await openVideo(request, decodeName(rest));
      response.writeHead(204).end();
      return;
    }
    request.resume();
    const bytes = await endVideo(decodeName(rest.slice(0, -"/end".length)));
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ bytes }));
  };

  const takeProgress = async (request) => {
    const entry = { ...readProgress(await readBody(request, MAX_PROGRESS_BYTES)), at: Date.now() - startedAt };
    progress.push(entry);
    onProgress?.(entry);
  };

  const serveInput = (pathname, response) => {
    if (pathname === "/inputs/model.glb" && model) return serveFile(model, "model/gltf-binary", response);
    const file = inputs?.get(pathname);
    if (!file) throw new SinkError(404, "not found");
    return serveFile(file, "application/octet-stream", response);
  };

  const route = async (request, response, { pathname, searchParams }) => {
    if (request.method === "GET" && pathname.startsWith("/inputs/")) return serveInput(pathname, response);
    if (request.method !== "POST") throw new SinkError(404, "not found");
    if (pathname.startsWith("/videos/")) return takeVideo(request, response, pathname.slice("/videos/".length));
    if (pathname.startsWith("/files/")) await takeFile(request, pathname.slice("/files/".length));
    else if (pathname.startsWith("/frames/")) await takeFrame(request, pathname.slice("/frames/".length), searchParams);
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
    await route(request, response, new URL(request.url ?? "/", "http://sink"));
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
    /** How many frames the encoder has taken whole: the turntable's, or the open video's. */
    get frames() {
      return frames;
    },
    /** The open video's name; null when none is. */
    get openVideo() {
      return clip?.name ?? null;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
