import { randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";

/** The header the page sends the token in (`SINK_TOKEN_HEADER`, src/features/render/harness/job-payload.ts). */
const TOKEN_HEADER = "x-sink-token";
/** File names the API gives outputs: letters, digits, dot, dash and underscore. */
const FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function hasToken(request, token) {
  const sent = Buffer.from(String(request.headers[TOKEN_HEADER] ?? ""));
  const expected = Buffer.from(token);
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}

/**
 * The loopback server the harness's export mode writes to, as the render worker runs one per job
 * (ADR 0005): `GET /inputs/model.glb` serves the job's model, `POST /files/<name>` takes an
 * encoded file, `POST /frames/<n>` takes frame n of a video as raw RGBA (`frameSize` pixels;
 * frames in order from 0, so anything else is 409) and `POST /progress` takes
 * `{progress, stage}`. Every request needs the job's token, and only the harness origin may call
 * it. A response goes back once its body is in, which is what makes the page wait before the next
 * file or frame. Here the files and frames stay in memory; the worker writes files to the job's
 * folder and pipes frames into ffmpeg.
 *
 * @param {{ model: Buffer, origin: string, frameSize?: { width: number, height: number } | null }} options
 */
export async function startSink({ model, origin, frameSize = null }) {
  const token = randomBytes(24).toString("hex");
  const files = new Map();
  const frames = [];
  const progress = [];

  const handle = async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": `${TOKEN_HEADER}, content-type`,
      });
      response.end();
      return;
    }
    if (!hasToken(request, token)) {
      response.writeHead(403).end();
      return;
    }
    const { pathname } = new URL(request.url ?? "/", "http://sink");
    if (request.method === "GET" && pathname === "/inputs/model.glb") {
      response.writeHead(200, { "Content-Type": "model/gltf-binary", "Content-Length": model.length });
      response.end(model);
      return;
    }
    if (request.method === "POST" && pathname.startsWith("/files/")) {
      const name = decodeURIComponent(pathname.slice("/files/".length));
      if (!FILE_NAME.test(name)) {
        response.writeHead(400).end();
        return;
      }
      files.set(name, { contentType: request.headers["content-type"], body: await readBody(request) });
      response.writeHead(204).end();
      return;
    }
    if (request.method === "POST" && pathname.startsWith("/frames/")) {
      if (pathname !== `/frames/${frames.length}`) {
        response.writeHead(409).end();
        return;
      }
      const body = await readBody(request);
      if (frameSize && body.length !== frameSize.width * frameSize.height * 4) {
        response.writeHead(400).end();
        return;
      }
      frames.push(body);
      response.writeHead(204).end();
      return;
    }
    if (request.method === "POST" && pathname === "/progress") {
      progress.push(JSON.parse((await readBody(request)).toString("utf8")));
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404).end();
  };
  const server = http.createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(400);
      response.end();
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    /** Name → `{ contentType, body }` for every file the page posted. */
    files,
    /** Every frame the page posted, raw RGBA, in order. */
    frames,
    /** Every `{progress, stage}` the page posted, in order. */
    progress,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
