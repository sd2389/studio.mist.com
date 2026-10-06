import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SINK_TOKEN_HEADER, startSink } from "./sink.mjs";

const ORIGIN = "http://127.0.0.1:3000";
const MODEL = Buffer.from("glTF-model-bytes");

let dir;
let sink;

async function open(options = {}) {
  sink = await startSink({ origin: ORIGIN, model: MODEL, outDir: dir, names: ["ring.png", "ring-top.png"], ...options });
  return sink;
}

/** One request to the sink; `chunks` are sent one by one, `pauseMs` apart. */
function send(route, { method = "POST", token = sink.token, origin = ORIGIN, body, chunks, pauseMs = 0, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${sink.url}${route}`, {
      method,
      headers: { ...(token === null ? {} : { [SINK_TOKEN_HEADER]: token }), ...(origin ? { Origin: origin } : {}), ...headers },
    }, (response) => {
      const parts = [];
      response.on("data", (part) => parts.push(part));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(parts), at: Date.now() }));
    });
    request.on("error", reject);
    (async () => {
      for (const chunk of chunks ?? (body === undefined ? [] : [body])) {
        request.write(chunk);
        if (pauseMs) await new Promise((wait) => setTimeout(wait, pauseMs));
      }
      request.end();
    })();
  });
}

const json = (value) => Buffer.from(JSON.stringify(value));

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "sink-test-"));
});

afterEach(async () => {
  await sink?.close();
  sink = null;
  await rm(dir, { recursive: true, force: true });
});

describe("the sink's token", () => {
  it("refuses a request without the job's token, or with another", async () => {
    await open();
    expect((await send("/inputs/model.glb", { method: "GET", token: null })).status).toBe(403);
    expect((await send("/inputs/model.glb", { method: "GET", token: "0".repeat(48) })).status).toBe(403);
    expect((await send("/files/ring.png", { token: "nope", body: "x" })).status).toBe(403);
    expect(sink.files.size).toBe(0);
  });

  it("refuses a page of another origin, even with the token", async () => {
    await open();
    const response = await send("/progress", { origin: "https://elsewhere.test", body: json({ progress: 0, stage: "loading" }) });
    expect(response.status).toBe(403);
    expect(sink.progress).toEqual([]);
  });

  it("answers the browser's preflight without it, for the harness origin only", async () => {
    await open();
    const response = await send("/files/ring.png", { method: "OPTIONS", token: null });
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(response.headers["access-control-allow-headers"]).toContain(SINK_TOKEN_HEADER);
  });

  it("is a fresh random token for every sink", async () => {
    const first = (await open()).token;
    await sink.close();
    expect((await open()).token).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{48}$/);
  });
});

describe("the sink's files", () => {
  it("serves the job's model, from its bytes or from the file the worker downloaded", async () => {
    await open();
    const response = await send("/inputs/model.glb", { method: "GET" });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("model/gltf-binary");
    expect(response.body).toEqual(MODEL);

    await sink.close();
    const modelPath = path.join(dir, "model.glb");
    writeFileSync(modelPath, MODEL);
    await open({ model: modelPath });
    const fromDisk = await send("/inputs/model.glb", { method: "GET" });
    expect(fromDisk.headers["content-length"]).toBe(String(MODEL.length));
    expect(fromDisk.body).toEqual(MODEL);
  });

  it("serves a convert job's files at their paths, and nothing else", async () => {
    const source = path.join(dir, "input-0");
    const mtl = path.join(dir, "input-1");
    writeFileSync(source, "o Band\nv 0 0 0\n");
    writeFileSync(mtl, "newmtl Gold\n");
    await open({ model: null, inputs: new Map([["/inputs/source", source], ["/inputs/companions/0", mtl]]) });

    const served = await send("/inputs/source", { method: "GET" });
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("application/octet-stream");
    expect(served.body.toString()).toBe("o Band\nv 0 0 0\n");
    expect((await send("/inputs/companions/0", { method: "GET" })).body.toString()).toBe("newmtl Gold\n");
    for (const route of ["/inputs/companions/1", "/inputs/model.glb", "/inputs/../input-0"]) {
      expect((await send(route, { method: "GET" })).status, route).toBe(404);
    }
    expect((await send("/inputs/source", { method: "GET", token: "nope" })).status).toBe(403);
  });

  it("stores each of the job's files once, in the order the page posts them", async () => {
    await open();
    const top = Buffer.from("top-image");
    const front = Buffer.from("front-image");
    expect((await send("/files/ring-top.png", { body: top, headers: { "Content-Type": "image/png" } })).status).toBe(204);
    expect((await send("/files/ring.png", { body: front, headers: { "Content-Type": "image/png" } })).status).toBe(204);
    expect((await send("/files/ring.png", { body: front })).status).toBe(409);

    expect([...sink.files.keys()]).toEqual(["ring-top.png", "ring.png"]);
    expect(sink.files.get("ring.png")).toEqual({
      path: path.join(dir, "ring.png"),
      bytes: front.length,
      sha256: createHash("sha256").update(front).digest("hex"),
      contentType: "image/png",
    });
    expect(readFileSync(path.join(dir, "ring-top.png"))).toEqual(top);
  });

  it("refuses a file the job doesn't make, or a name that could leave its folder", async () => {
    await open();
    expect((await send("/files/other.png", { body: "x" })).status).toBe(400);
    expect((await send(`/files/${encodeURIComponent("../ring.png")}`, { body: "x" })).status).toBe(400);
    expect((await send("/files/%E0%A4%A", { body: "x" })).status).toBe(400);
    expect(sink.files.size).toBe(0);
  });

  it("refuses an empty file and one over the cap, keeping neither", async () => {
    await open({ maxFileBytes: 8 });
    expect((await send("/files/ring.png", { body: "" })).status).toBe(400);
    expect((await send("/files/ring.png", { body: "123456789" })).status).toBe(413);
    expect(sink.files.size).toBe(0);
    expect(existsSync(path.join(dir, "ring.png"))).toBe(false);
    expect((await send("/files/ring.png", { body: "12345678" })).status).toBe(204);
  });

  // The page awaits each response before it draws the next image: that is the backpressure.
  it("answers a file only once all of it is on disk", async () => {
    await open();
    const sentAt = Date.now();
    const response = await send("/files/ring.png", { chunks: [Buffer.alloc(64 * 1024, 1), Buffer.alloc(64 * 1024, 2)], pauseMs: 300 });
    expect(response.status).toBe(204);
    expect(response.at - sentAt).toBeGreaterThanOrEqual(290);
    expect(sink.files.get("ring.png").bytes).toBe(128 * 1024);
    expect(readFileSync(path.join(dir, "ring.png")).subarray(-1)[0]).toBe(2);
  });
});

describe("the sink's frames", () => {
  const frameSize = { width: 2, height: 2 };
  const frame = (fill) => Buffer.alloc(2 * 2 * 4, fill);

  it("hands frames to the encoder in order, each once all of it is in", async () => {
    const handed = [];
    await open({ frameSize, onFrameBytes: (index, pixels) => handed.push([index, pixels[0]]) });
    expect((await send("/frames/0", { body: frame(7) })).status).toBe(204);
    expect((await send("/frames/2", { body: frame(9) })).status).toBe(409);
    expect((await send("/frames/1", { body: frame(8) })).status).toBe(204);
    expect(handed).toEqual([[0, 7], [1, 8]]);
    expect(sink.frames).toBe(2);
  });

  // As the harness sends frames: in parts, so that no request body is too large for DevTools.
  it("takes a frame in parts, in order, each with its offset and the frame's length", async () => {
    const handed = [];
    await open({ frameSize, onFrameBytes: (index, bytes) => handed.push([index, [...bytes]]) });
    const part = (offset, bytes, length = 16) => send(`/frames/0?offset=${offset}&length=${length}`, { body: Buffer.from(bytes) });

    expect((await part(0, [1, 1, 1, 1, 1, 1])).status).toBe(204);
    expect(sink.frames).toBe(0);
    expect((await part(4, [2])).status).toBe(409);
    expect((await send("/frames/1", { body: frame(3) })).status).toBe(409);
    expect((await part(6, Buffer.alloc(11, 2))).status).toBe(413);
    expect((await part(6, Buffer.alloc(10, 2), 17)).status).toBe(400);
    expect((await part(6, Buffer.alloc(10, 2))).status).toBe(204);

    expect(sink.frames).toBe(1);
    expect(handed).toEqual([[0, [1, 1, 1, 1, 1, 1]], [0, Array(10).fill(2)]]);
  });

  it("counts a frame once the encoder has it, so one it couldn't take is no frame", async () => {
    const handed = [];
    await open({ frameSize, onFrameBytes: (index) => {
      if (!handed.length) {
        handed.push("refused");
        throw new Error("ffmpeg is gone");
      }
      handed.push(index);
    } });
    expect((await send("/frames/0", { body: frame(7) })).status).toBe(500);
    expect(sink.frames).toBe(0);
    expect((await send("/frames/0", { body: frame(7) })).status).toBe(204);
    expect([handed, sink.frames]).toEqual([["refused", 0], 1]);
  });

  it("refuses a frame of another size, and frames for a job that has none", async () => {
    await open({ frameSize, onFrameBytes: () => {} });
    expect((await send("/frames/0", { body: Buffer.alloc(15) })).status).toBe(400);
    expect((await send("/frames/0", { body: Buffer.alloc(17) })).status).toBe(413);
    // Where the page says how long it is, before the sink reads any of it.
    expect((await send("/frames/0", { body: Buffer.alloc(17), headers: { "Content-Length": "17" } })).status).toBe(413);
    expect(sink.frames).toBe(0);
    await sink.close();
    await open();
    expect((await send("/frames/0", { body: frame(1) })).status).toBe(404);
  });
});

describe("the sink's Campaign Pack", () => {
  const STILL = "RING-1/stills/18k-yellow-gold_front.jpg";
  const VIDEO = "RING-1/video/18k-yellow-gold_turntable_1080x1080.mp4";
  const clip = { width: 2, height: 2, fps: 30, frames: 2 };
  const frame = (fill) => Buffer.alloc(2 * 2 * 4, fill);
  const path_ = (name) => encodeURIComponent(name);

  /** A sink for a pack whose videos are written by hand: what each was opened with, and its bytes. */
  async function openPack(options = {}) {
    const opened = [];
    const videos = {
      open: async (name, params) => {
        if (params.width !== 2) throw new Error(`the pack makes no ${params.width}x${params.height} turntable`);
        const video = { name, params, bytes: [] };
        opened.push(video);
        return {
          write: async (bytes) => video.bytes.push(...bytes),
          finish: async () => {
            const file = path.join(dir, `video-${opened.length}.mp4`);
            writeFileSync(file, `mp4 of ${video.bytes.length} bytes`);
            return { path: file, bytes: readFileSync(file).length, sha256: "f".repeat(64) };
          },
        };
      },
    };
    await open({ names: null, paths: true, videos, ...options });
    return opened;
  }

  it("takes files under their paths in the ZIP, each stored on disk as an entry of its own", async () => {
    await openPack();
    expect((await send(`/files/${path_(STILL)}`, { body: "front", headers: { "Content-Type": "image/jpeg" } })).status).toBe(204);
    expect((await send(`/files/${path_("RING-1/README.md")}`, { body: "# Ring", headers: { "Content-Type": "text/markdown" } })).status).toBe(204);
    expect((await send(`/files/${path_(STILL)}`, { body: "again" })).status).toBe(409);

    expect([...sink.files.keys()]).toEqual([STILL, "RING-1/README.md"]);
    expect(sink.files.get(STILL)).toMatchObject({ path: path.join(dir, "entry-0"), bytes: 5, contentType: "image/jpeg" });
    expect(readFileSync(path.join(dir, "entry-1"), "utf8")).toBe("# Ring");
  });

  it("refuses a path that could leave the folder, or isn't one", async () => {
    await openPack();
    for (const name of ["../ring.jpg", "RING-1/../../ring.jpg", "RING-1/./x.jpg", "/RING-1/x.jpg", "RING-1//x.jpg", "RING-1/x y.jpg", `RING-1/${"x".repeat(1100)}`]) {
      expect((await send(`/files/${path_(name)}`, { body: "x" })).status).toBe(400);
    }
    expect(sink.files.size).toBe(0);
  });

  it("takes each video's frames at its size, one video at a time, and stores its MP4 under its path", async () => {
    const opened = await openPack();
    expect((await send("/frames/0", { body: frame(1) })).status).toBe(404);
    expect((await send(`/videos/${path_(VIDEO)}`, { body: json(clip) })).status).toBe(204);
    expect((await send(`/videos/${path_("RING-1/video/other.mp4")}`, { body: json(clip) })).status).toBe(409);
    expect((await send("/frames/0", { body: frame(1) })).status).toBe(204);
    // Not before its last frame.
    expect((await send(`/videos/${path_(VIDEO)}/end`)).status).toBe(409);
    expect((await send("/frames/1", { body: frame(2) })).status).toBe(204);
    expect((await send("/frames/2", { body: frame(3) })).status).toBe(409);

    const end = await send(`/videos/${path_(VIDEO)}/end`);
    expect([end.status, JSON.parse(end.body.toString())]).toEqual([200, { bytes: 15 }]);
    expect(opened.map(({ name, params, bytes }) => [name, params, bytes.length])).toEqual([[VIDEO, clip, 32]]);
    expect([...sink.files]).toEqual([[VIDEO, { path: path.join(dir, "video-1.mp4"), bytes: 15, sha256: "f".repeat(64), contentType: "video/mp4" }]]);
    expect([sink.openVideo, (await send("/frames/0", { body: frame(1) })).status]).toEqual([null, 404]);
    expect((await send(`/videos/${path_(VIDEO)}`, { body: json(clip) })).status).toBe(409);
  });

  it("refuses a video its outputs don't make, one that isn't one, and the end of one that isn't open", async () => {
    await openPack();
    expect((await send(`/videos/${path_(VIDEO)}`, { body: json({ ...clip, width: 4 }) })).status).toBe(400);
    expect((await send(`/videos/${path_(VIDEO)}`, { body: json({ ...clip, frames: 0 }) })).status).toBe(400);
    expect((await send(`/videos/${path_("../x.mp4")}`, { body: json(clip) })).status).toBe(400);
    expect((await send(`/videos/${path_(VIDEO)}/end`)).status).toBe(409);
    expect(sink.openVideo).toBe(null);
    await sink.close();
    await open();
    expect((await send(`/videos/${path_(VIDEO)}`, { body: json(clip) })).status).toBe(404);
  });

  it("takes nothing more for a video while its encoder finishes it", async () => {
    let finishing;
    const finished = new Promise((resolve) => (finishing = resolve));
    await open({
      names: null,
      paths: true,
      videos: {
        open: async () => ({
          write: async () => {},
          finish: async () => {
            await finished;
            return { path: path.join(dir, "video-0.mp4"), bytes: 9, sha256: "0".repeat(64) };
          },
        }),
      },
    });
    await send(`/videos/${path_(VIDEO)}`, { body: json(clip) });
    await send("/frames/0", { body: frame(1) });
    await send("/frames/1", { body: frame(2) });
    const ending = send(`/videos/${path_(VIDEO)}/end`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect((await send("/frames/2", { body: frame(3) })).status).toBe(409);
    expect((await send(`/videos/${path_(VIDEO)}/end`)).status).toBe(409);
    expect((await send(`/videos/${path_("RING-1/video/next.mp4")}`, { body: json(clip) })).status).toBe(409);
    finishing();
    expect((await ending).status).toBe(200);
    expect((await send(`/videos/${path_("RING-1/video/next.mp4")}`, { body: json(clip) })).status).toBe(204);
  });

  it("tells its outputs of each file it stores, and takes no more than the job makes", async () => {
    const stored = [];
    await openPack({ maxFiles: 2, onStored: (name, file) => stored.push([name, file.bytes]) });
    await send(`/files/${path_(STILL)}`, { body: "front" });
    await send(`/videos/${path_(VIDEO)}`, { body: json(clip) });
    await send("/frames/0", { body: frame(1) });
    await send("/frames/1", { body: frame(2) });
    await send(`/videos/${path_(VIDEO)}/end`);
    expect((await send(`/files/${path_("RING-1/README.md")}`, { body: "# Ring" })).status).toBe(413);
    expect(stored).toEqual([[STILL, 5], [VIDEO, 15]]);
  });
});

describe("the sink's progress", () => {
  it("keeps every report in order, with when it came, and passes each on", async () => {
    const heard = [];
    await open({ onProgress: (entry) => heard.push(entry.stage) });
    await send("/progress", { body: json({ progress: 0, stage: "loading" }) });
    await send("/progress", { body: json({ progress: 0.5, stage: "rendering" }) });
    await send("/progress", { body: json({ progress: 1, stage: "rendering" }) });

    expect(sink.progress.map(({ progress, stage }) => [progress, stage])).toEqual([[0, "loading"], [0.5, "rendering"], [1, "rendering"]]);
    expect(sink.progress.every((entry, index) => index === 0 || entry.at >= sink.progress[index - 1].at)).toBe(true);
    expect(heard).toEqual(["loading", "rendering", "rendering"]);
  });

  it("refuses a report that isn't one", async () => {
    await open();
    for (const body of ["{", json({ progress: 2, stage: "rendering" }), json({ progress: 0.5, stage: "uploading" }), json([])]) {
      expect((await send("/progress", { body })).status).toBe(400);
    }
    expect((await send("/progress", { body: Buffer.alloc(2048, 32) })).status).toBe(413);
    expect(sink.progress).toEqual([]);
  });
});
