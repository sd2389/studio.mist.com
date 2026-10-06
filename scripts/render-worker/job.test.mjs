import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError, JobLostError } from "./api.mjs";
import { writeFakeFfmpeg } from "./fake-ffmpeg.mjs";
import { JobFailure } from "./failure.mjs";
import { inputFailure, runJob } from "./job.mjs";
import { SINK_TOKEN_HEADER } from "./sink.mjs";

const HARNESS = "http://127.0.0.1:3000";
const SWIFTSHADER = { browser: "HeadlessChrome/145", backend: "webgpu", adapter: { vendor: "google", architecture: "swiftshader", device: "", description: "" } };
const IMAGE = Buffer.from("\x89PNG pretend pixels");
/** A binary glTF 2.0 header that gives its own length, and nothing else. */
const GLB = (() => {
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12, 8);
  return header;
})();

const PAYLOAD = {
  kind: "angle_set",
  spec: { width: 64, height: 48, format: "png", jpeg_quality: 0.95, transparent: false, cameras: [{ angle: "front" }, { pose: "pose-top" }], output_names: ["ring-front.png", "ring-pose-top.png"] },
  look: { material: "gold-18k-yellow", lighting: "studio", slot_selections: {}, scene_settings: {}, model_config: {} },
  look_items: { environments: [], backgrounds: [], grounds: [], metals: [], gems: [], user_materials: [] },
  model: { path: "/render-jobs/7/inputs/model" },
  watermark: true,
  limits: { max_edge: 64, max_runtime_seconds: 300 },
  scene: { id: 3, name: "Ring", sku: null },
};
const LABELS = { "ring-front.png": "front", "ring-pose-top.png": "pose-top" };

let tmpDir;
let binDir;
let calls;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "job-test-"));
  binDir = await mkdtemp(path.join(os.tmpdir(), "job-test-bin-"));
  calls = [];
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  await rm(binDir, { recursive: true, force: true });
});

/** The API, as the job's client sees it; `overrides` replace any call. */
function fakeApi(overrides = {}) {
  const record = (name, ...args) => calls.push([name, ...args]);
  const job = {
    id: 7,
    payload: async () => (record("payload"), structuredClone(overrides.payload ?? PAYLOAD)),
    heartbeat: async (body) => (record("heartbeat", body), { lease_expires_at: "2026-10-05T12:00:00Z", cancel: false }),
    uploads: async (files) => {
      record("uploads", files);
      return { files: files.map(({ name }) => ({ name, key: `customers/1/renders/7/${name}`, url: `https://storage.test/${name}?sig=1`, headers: { "Content-Type": "image/png" } })) };
    },
    put: async (target, filePath) => record("put", target.name, readFileSync(filePath)),
    complete: async (body) => (record("complete", body), { id: 7, status: "completed" }),
    fail: async (body) => (record("fail", body), { id: 7, status: "failed" }),
    download: async (source, dest) => {
      record("download", source);
      writeFileSync(dest, GLB);
      return GLB.length;
    },
    read: async () => ({ body: Buffer.from(""), contentType: "image/png" }),
  };
  for (const [name, replacement] of Object.entries(overrides)) if (name !== "payload") job[name] = replacement(job);
  return { job: () => job };
}

/** What a harness page does: posts each image to the sink, then says it is done. */
async function renderImages({ payload, sink }, renderer = SWIFTSHADER) {
  for (const name of payload.spec.output_names) {
    const response = await fetch(`${sink.url}/files/${name}`, { method: "POST", headers: { [SINK_TOKEN_HEADER]: sink.token, "Content-Type": "image/png" }, body: IMAGE });
    if (!response.ok) throw new Error(`sink ${response.status}`);
  }
  await fetch(`${sink.url}/progress`, { method: "POST", headers: { [SINK_TOKEN_HEADER]: sink.token }, body: JSON.stringify({ progress: 1, stage: "rendering" }) });
  const outputs = payload.spec.output_names.map((name) => ({ name, content_type: "image/png", width: 64, height: 48, label: LABELS[name] }));
  return { state: "done", result: { renderer, outputs } };
}

/** A browser whose pages run `page(handOff, context)` once the export mode is open. */
function fakeBrowser(page = (handOff) => renderImages(handOff)) {
  const contexts = [];
  const listeners = new Map();
  return {
    contexts,
    once: (event, listener) => listeners.set(event, listener),
    off: (event) => listeners.delete(event),
    /** As Playwright does when the browser process goes away. */
    exit: () => listeners.get("disconnected")?.(),
    async newContext() {
      let handOff = null;
      let closeContext;
      const closed = new Promise((resolve) => (closeContext = resolve));
      const context = {
        closed,
        isClosed: false,
        route: async () => {},
        routeWebSocket: async () => {},
        addInitScript: async (_script, arg) => {
          handOff = arg;
        },
        newPage: async () => {
          let outcome;
          return {
            on() {},
            once() {},
            goto: async (url) => expect(url).toBe(`${HARNESS}/render-harness?mode=export`),
            waitForFunction: async () => {
              outcome = await page(handOff, context);
            },
            evaluate: async () => outcome,
          };
        },
        close: async () => {
          context.isClosed = true;
          closeContext();
        },
      };
      contexts.push(context);
      return context;
    },
  };
}

async function run({ api = fakeApi(), browser = fakeBrowser(), stopping = new AbortController().signal, heartbeatSeconds = 20, kind = "angle_set", ffmpegPath = "ffmpeg" } = {}) {
  const log = [];
  const result = await runJob({
    claim: { job_id: 7, job_token: "job-secret", kind, lease_seconds: 120, heartbeat_seconds: heartbeatSeconds },
    api,
    browser,
    config: { harnessUrl: HARNESS, profileName: "swiftshader", tmpDir, assetPrefixes: [], ffmpegPath },
    assets: { get: async () => ({ path: "/dev/null", contentType: "text/plain" }) },
    stopping,
    log: (message) => log.push(message),
  });
  return { ...result, log };
}

const called = (name) => calls.filter(([call]) => call === name).map(([, ...args]) => args);

describe("runJob", () => {
  it("renders, uploads every image and completes with its key, size, hash and renderer", async () => {
    const browser = fakeBrowser();
    const { outcome } = await run({ browser });

    expect(outcome).toBe("completed");
    expect(called("download")).toEqual([[{ path: "/render-jobs/7/inputs/model" }]]);
    expect(called("uploads")).toEqual([[[
      { name: "ring-front.png", content_type: "image/png", bytes: IMAGE.length },
      { name: "ring-pose-top.png", content_type: "image/png", bytes: IMAGE.length },
    ]]]);
    expect(called("put").map(([name, body]) => [name, body.equals(IMAGE)])).toEqual([["ring-front.png", true], ["ring-pose-top.png", true]]);
    const [[body]] = called("complete");
    expect(body.outputs).toEqual([
      { name: "ring-front.png", key: "customers/1/renders/7/ring-front.png", content_type: "image/png", bytes: IMAGE.length, width: 64, height: 48, label: "front", meta: { sha256: createHash("sha256").update(IMAGE).digest("hex") } },
      { name: "ring-pose-top.png", key: "customers/1/renders/7/ring-pose-top.png", content_type: "image/png", bytes: IMAGE.length, width: 64, height: 48, label: "pose-top", meta: { sha256: createHash("sha256").update(IMAGE).digest("hex") } },
    ]);
    expect(body.renderer).toEqual(SWIFTSHADER);
    expect(called("fail")).toEqual([]);
    // The page got its job and a sink, never a token of the API's.
    expect(browser.contexts[0].isClosed).toBe(true);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("reports each stage on a heartbeat as soon as it starts", async () => {
    await run();
    expect(called("heartbeat").map(([body]) => body)).toEqual([
      { progress: 0, stage: "loading" },
      { progress: 0.95, stage: "rendering" },
      { progress: 0.95, stage: "uploading" },
    ]);
  });

  it("drops a job the API took back, and says nothing of it", async () => {
    const api = fakeApi({ heartbeat: () => async () => {
      throw new JobLostError("POST /render-jobs/7/heartbeat: 401 Invalid job token", 401);
    } });
    const browser = fakeBrowser(async (_handOff, context) => {
      await context.closed;
      return { state: "error:closed" };
    });
    const { outcome } = await run({ api, browser, heartbeatSeconds: 0.02 });

    expect(outcome).toBe("lost");
    expect(called("fail")).toEqual([]);
    expect(called("complete")).toEqual([]);
  });

  it("stops a job its owner canceled and fails it as canceled", async () => {
    const api = fakeApi({ heartbeat: () => async () => ({ lease_expires_at: "2026-10-05T12:00:00Z", cancel: true }) });
    const browser = fakeBrowser(async (_handOff, context) => {
      await context.closed;
      return { state: "error:closed" };
    });
    const { outcome } = await run({ api, browser, heartbeatSeconds: 0.02 });

    expect(outcome).toBe("failed");
    expect(called("fail")).toEqual([[{ error: "The job was canceled or ran past its run time.", code: "canceled", retryable: false }]]);
    expect(browser.contexts[0].isClosed).toBe(true);
  });

  it("fails a job the page can't read as invalid_spec, for good", async () => {
    const { outcome } = await run({ browser: fakeBrowser(async () => ({ state: "error:invalid render job: spec.cameras" })) });
    expect(outcome).toBe("failed");
    expect(called("fail")).toEqual([[{ error: "invalid render job: spec.cameras", code: "invalid_spec", retryable: false }]]);
  });

  it("fails anything else the page reports as unknown, to be tried again", async () => {
    await run({ browser: fakeBrowser(async () => ({ state: "error:The live canvas is 512x288 but its renderer draws 300x150." })) });
    expect(called("fail")).toEqual([[{ error: "The live canvas is 512x288 but its renderer draws 300x150.", code: "unknown", retryable: true }]]);
  });

  it("refuses a model that isn't GLB, and one the API no longer has", async () => {
    await run({ api: fakeApi({ download: () => async (_source, dest) => (writeFileSync(dest, "solid stl"), 9) }) });
    expect(called("fail").at(-1)[0]).toMatchObject({ code: "model_unreadable", retryable: false });

    await run({ api: fakeApi({ download: () => async () => {
      throw new ApiError("GET /render-jobs/7/inputs/model: 404", 404);
    } }) });
    expect(called("fail").at(-1)[0]).toMatchObject({ code: "input_missing", retryable: false });
  });

  it("fails a job drawn on another backend than the profile's, and replaces the browser", async () => {
    const webgl = { browser: "HeadlessChrome/145", backend: "webgl2", adapter: null };
    const { outcome, recycleBrowser } = await run({ browser: fakeBrowser((handOff) => renderImages(handOff, webgl)) });
    expect(outcome).toBe("failed");
    expect(recycleBrowser).toBe(true);
    expect(called("fail")[0][0]).toMatchObject({ code: "gpu_lost", retryable: true });
    expect(called("complete")).toEqual([]);
  });

  it("signs again when storage refuses a PUT", async () => {
    let refused = false;
    const api = fakeApi({ put: () => async (target, filePath) => {
      if (!refused) {
        refused = true;
        throw new ApiError("PUT storage.test: 403", 403);
      }
      calls.push(["put", target.name, readFileSync(filePath)]);
    } });
    const { outcome } = await run({ api });

    expect(outcome).toBe("completed");
    expect(called("uploads")).toHaveLength(2);
    expect(called("put").map(([name]) => name)).toEqual(["ring-front.png", "ring-pose-top.png"]);
  });

  it("uploads again after a 400 on complete, and fails as upload_failed when that doesn't do", async () => {
    let completes = 0;
    const flaky = fakeApi({ complete: () => async (body) => {
      completes += 1;
      calls.push(["complete", body]);
      if (completes === 1) throw new ApiError("POST /render-jobs/7/complete: 400 outputs[0].bytes: 19 declared, nothing stored", 400);
      return { id: 7, status: "completed" };
    } });
    expect((await run({ api: flaky })).outcome).toBe("completed");
    expect(called("uploads")).toHaveLength(2);
    expect(called("put")).toHaveLength(4);

    calls = [];
    const broken = fakeApi({ complete: () => async () => {
      throw new ApiError("POST /render-jobs/7/complete: 400 outputs[0].key: outside this job's prefix", 400);
    } });
    await run({ api: broken });
    expect(called("fail")).toEqual([[{ error: "POST /render-jobs/7/complete: 400 outputs[0].key: outside this job's prefix", code: "upload_failed", retryable: true }]]);
  });

  it("fails a job whose browser exited as browser_crashed, and replaces the browser", async () => {
    const browser = fakeBrowser(async (_handOff, context) => {
      browser.exit();
      await context.closed;
      return { state: "error:closed" };
    });
    const { outcome, recycleBrowser } = await run({ browser });
    expect([outcome, recycleBrowser]).toEqual(["failed", true]);
    expect(called("fail")).toEqual([[{ error: "The browser exited.", code: "browser_crashed", retryable: true }]]);
  });

  it("hands a job back when the worker stops", async () => {
    const stopper = new AbortController();
    const browser = fakeBrowser(async (_handOff, context) => {
      stopper.abort();
      await context.closed;
      return { state: "error:closed" };
    });
    const { outcome } = await run({ browser, stopping: stopper.signal });
    expect(outcome).toBe("failed");
    expect(called("fail")).toEqual([[{ error: "The worker shut down.", code: "unknown", retryable: true }]]);
  });
});

const TURNTABLE = {
  ...PAYLOAD,
  kind: "turntable",
  spec: { width: 4, height: 2, fps: 30, frames: 3, quality: "high", path: { orbit: { start: { angle: "front" } } }, output_names: ["ring.mp4"] },
  limits: { max_edge: 4, max_runtime_seconds: 1800 },
};
const SPIN = {
  ...PAYLOAD,
  kind: "spin",
  spec: { frames: 3, size: 4, format: "jpeg", jpeg_quality: 0.9, transparent: false, output_names: ["ring-spin.zip"] },
  limits: { max_edge: 4, max_runtime_seconds: 900 },
};
const JPEG = Buffer.from("\xff\xd8 pretend jpeg", "latin1");
const VIEWER = "<!doctype html><title>Ring</title><canvas id=view></canvas>";

const postProgress = (sink, progress) =>
  fetch(`${sink.url}/progress`, { method: "POST", headers: { [SINK_TOKEN_HEADER]: sink.token }, body: JSON.stringify({ progress, stage: "rendering" }) });

/** What a harness page does with a turntable: posts each raw frame in order, then says it is done. */
async function renderFrames({ payload, sink }) {
  const { width, height, frames } = payload.spec;
  for (let index = 0; index < frames; index += 1) {
    const response = await fetch(`${sink.url}/frames/${index}`, { method: "POST", headers: { [SINK_TOKEN_HEADER]: sink.token }, body: Buffer.alloc(width * height * 4, index) });
    if (!response.ok) return { state: `error:sink POST /frames/${index}: ${response.status}` };
    await postProgress(sink, (index + 1) / frames);
  }
  return { state: "done", result: { renderer: SWIFTSHADER, outputs: [] } };
}

/** What a harness page does with a spin: posts each frame, then the viewer page, as files. */
async function renderSpin({ sink }) {
  const files = [
    ...["frame_001.jpg", "frame_002.jpg", "frame_003.jpg"].map((name) => ({ name, type: "image/jpeg", body: JPEG })),
    { name: "spin.html", type: "text/html", body: Buffer.from(VIEWER) },
  ];
  for (const [index, { name, type, body }] of files.entries()) {
    const response = await fetch(`${sink.url}/files/${name}`, { method: "POST", headers: { [SINK_TOKEN_HEADER]: sink.token, "Content-Type": type }, body });
    if (!response.ok) return { state: `error:sink POST /files/${name}: ${response.status}` };
    await postProgress(sink, (index + 1) / files.length);
  }
  return { state: "done", result: { renderer: SWIFTSHADER, outputs: files.map(({ name, type }) => ({ name, content_type: type, width: 4, height: 4, label: null })) } };
}

const stages = () => called("heartbeat").map(([body]) => body.stage);
const rises = (values) => values.every((value, index) => index === 0 || value >= values[index - 1]);

describe("runJob, turntables", () => {
  it("encodes the frames as they come and completes with the MP4 the API plans", async () => {
    const ffmpegPath = await writeFakeFfmpeg(binDir);
    const { outcome } = await run({ api: fakeApi({ payload: TURNTABLE }), browser: fakeBrowser(renderFrames), kind: "turntable", ffmpegPath });

    expect(outcome).toBe("completed");
    const mp4 = Buffer.from("fake mp4: 3 frames of 4x2");
    expect(called("uploads")).toEqual([[[{ name: "ring.mp4", content_type: "video/mp4", bytes: mp4.length }]]]);
    expect(called("put").map(([name, body]) => [name, body.toString()])).toEqual([["ring.mp4", mp4.toString()]]);
    const [[body]] = called("complete");
    expect(body.outputs).toEqual([
      { name: "ring.mp4", key: "customers/1/renders/7/ring.mp4", content_type: "video/mp4", bytes: mp4.length, width: 4, height: 2, label: null, meta: { sha256: createHash("sha256").update(mp4).digest("hex") } },
    ]);
    expect(stages()).toEqual(["loading", "rendering", "encoding", "uploading"]);
    expect(rises(called("heartbeat").map(([beat]) => beat.progress))).toBe(true);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("fails as encode_failed, to be tried again, when ffmpeg dies mid-clip", async () => {
    const ffmpegPath = await writeFakeFfmpeg(binDir, { failAfterFrames: 1 });
    const { outcome } = await run({ api: fakeApi({ payload: TURNTABLE }), browser: fakeBrowser(renderFrames), kind: "turntable", ffmpegPath });

    expect(outcome).toBe("failed");
    expect(called("fail")).toEqual([[{
      error: "ffmpeg exited with code 1: [libx264 @ 0x1] fake: out of memory | Error while encoding the stream",
      code: "encode_failed",
      retryable: true,
    }]]);
    expect(called("complete")).toEqual([]);
  });

  it("fails as encode_failed when ffmpeg encodes fewer frames than the page sent", async () => {
    const ffmpegPath = await writeFakeFfmpeg(binDir, { dropFrames: 1 });
    await run({ api: fakeApi({ payload: TURNTABLE }), browser: fakeBrowser(renderFrames), kind: "turntable", ffmpegPath });
    expect(called("fail")).toEqual([[{ error: "ffmpeg encoded 2 of the clip's 3 frames.", code: "encode_failed", retryable: true }]]);
  });

  it("fails as encode_failed when there is no ffmpeg, before the page renders a frame", async () => {
    let rendered = false;
    const browser = fakeBrowser((handOff) => {
      rendered = true;
      return renderFrames(handOff);
    });
    await run({ api: fakeApi({ payload: TURNTABLE }), browser, kind: "turntable", ffmpegPath: path.join(binDir, "no-ffmpeg") });
    expect(called("fail")[0][0]).toMatchObject({ code: "encode_failed", retryable: true });
    expect(called("fail")[0][0].error).toMatch(/^ffmpeg could not start \(spawn .*no-ffmpeg ENOENT\)/);
    expect(rendered).toBe(false);
  });

  it("stops ffmpeg and fails as timeout when the clip runs past the job's run time", async () => {
    const ffmpegPath = await writeFakeFfmpeg(binDir, { hang: true });
    const payload = { ...TURNTABLE, limits: { ...TURNTABLE.limits, max_runtime_seconds: 2 } };
    const { outcome } = await run({ api: fakeApi({ payload }), browser: fakeBrowser(renderFrames), kind: "turntable", ffmpegPath });

    expect(outcome).toBe("failed");
    expect(called("fail")).toEqual([[{ error: "The job ran past its run time.", code: "timeout", retryable: false }]]);
    const { pid } = JSON.parse(readFileSync(`${ffmpegPath}.json`, "utf8"));
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
  });
});

describe("runJob, spins", () => {
  it("zips the frames and the viewer page and completes with the ZIP the API plans", async () => {
    const { outcome } = await run({ api: fakeApi({ payload: SPIN }), browser: fakeBrowser(renderSpin), kind: "spin" });

    expect(outcome).toBe("completed");
    const [[name, archive]] = called("put");
    expect(name).toBe("ring-spin.zip");
    const files = unzipSync(archive);
    expect(Object.keys(files)).toEqual(["frame_001.jpg", "frame_002.jpg", "frame_003.jpg", "spin.html"]);
    expect(Buffer.from(files["frame_003.jpg"])).toEqual(JPEG);
    expect(new TextDecoder().decode(files["spin.html"])).toBe(VIEWER);
    const [[body]] = called("complete");
    expect(body.outputs).toEqual([
      { name: "ring-spin.zip", key: "customers/1/renders/7/ring-spin.zip", content_type: "application/zip", bytes: archive.length, width: 4, height: 4, label: null, meta: { sha256: createHash("sha256").update(archive).digest("hex") } },
    ]);
    expect(stages()).toEqual(["loading", "rendering", "encoding", "uploading"]);
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("fails a spin whose page left a frame out", async () => {
    const browser = fakeBrowser(async (handOff) => {
      const rendered = await renderSpin(handOff);
      rendered.result.outputs.splice(1, 1);
      return rendered;
    });
    await run({ api: fakeApi({ payload: SPIN }), browser, kind: "spin" });
    expect(called("fail")[0][0]).toMatchObject({ code: "unknown", retryable: true });
    expect(called("fail")[0][0].error).toMatch(/^The page made frame_001.jpg, frame_003.jpg, spin.html; the job makes frame_001.jpg, frame_002.jpg/);
  });
});

describe("inputFailure", () => {
  it("ends the job for good when an input is gone, so its credits go back", () => {
    for (const status of [403, 404, 410]) {
      const failure = inputFailure(new ApiError(`GET background: ${status}`, status));
      expect(failure).toBeInstanceOf(JobFailure);
      expect([failure.code, failure.retryable]).toEqual(["input_missing", false]);
    }
  });

  it("lets the API retry the job when fetching an input failed for another reason", () => {
    const failure = inputFailure(new ApiError("GET background: 503", 503));
    expect([failure.code, failure.retryable]).toEqual(["unknown", true]);
    expect(inputFailure(new TypeError("fetch failed")).retryable).toBe(true);
  });

  it("keeps a lost job lost", () => {
    const lost = new JobLostError("gone", 409);
    expect(inputFailure(lost)).toBe(lost);
  });
});
