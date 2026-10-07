import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError, TooLargeError } from "./api.mjs";
import { checkGlbFile, CONVERT_OUTPUT_NAMES, convertPageFailure, downloadConvertInputs, sniffSource, startConvertOutputs, webpSize } from "./convert.mjs";
import { runJob } from "./job.mjs";
import { SINK_TOKEN_HEADER } from "./sink.mjs";

const HARNESS = "http://127.0.0.1:3000";
const SWIFTSHADER = { browser: "HeadlessChrome/145", backend: "webgpu", adapter: { vendor: "google", architecture: "swiftshader", device: "", description: "" } };
const OBJ = Buffer.from("mtllib ring.mtl\no Band\nusemtl Gold\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
const MTL = Buffer.from("newmtl Gold\nKd 1 0.8 0.3\n");

/** A binary glTF 2.0: its header, a JSON chunk naming `meshes`, and a binary chunk. */
function glb({ meshes = [{ primitives: [] }], length = null } = {}) {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, meshes }).padEnd(48, " "));
  const bin = Buffer.alloc(8);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.write(type, 4, "latin1");
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk("JSON", json), chunk("BIN\0", bin)]);
  header.writeUInt32LE(length ?? 12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/** The first 30 bytes of a lossy WebP of `width` × `height`: all webpSize reads. */
function webp(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "latin1");
  buffer.write("WEBPVP8 ", 8, "latin1");
  buffer.writeUIntBE(0x9d012a, 23, 3);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

/** conversion.json as the convert mode writes it. */
const report = (fields = {}) => ({
  model_config: { source: "upload-ingest", slots: [{ slotId: "Metal 1", kind: "metal" }] },
  slot_selections: { "Metal 1": "gold-14k-yellow" },
  polygon_count: 680,
  units: { mm_per_unit: 1, source: "declared", size_mm: [21, 20.5, 8.5] },
  roles: { "Metal 1": "metal" },
  warnings: [],
  ...fields,
});

const SPEC = {
  item_id: 9001,
  source: { key: "customers/7/ingest/31/9001/ring.obj", filename: "ring.obj", bytes: OBJ.length },
  companions: [{ key: "customers/7/ingest/31/9001/ring.mtl", filename: "ring.mtl", bytes: MTL.length }],
  units: "auto",
  max_polygons: 100_000,
  decimate: "auto",
  thumbnail: { size: 512, format: "webp" },
  scene: { sku: "R-1", name: "Ring", category: "Ring", note: null },
  output_names: CONVERT_OUTPUT_NAMES,
};
const PAYLOAD = {
  kind: "convert",
  spec: SPEC,
  source: { path: "/render-jobs/7/inputs/source" },
  companions: [{ path: "/render-jobs/7/inputs/companions/0" }],
  limits: { max_edge: 512, max_runtime_seconds: 600 },
};

let dir;
let calls;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "convert-test-"));
  calls = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = (name, bytes) => {
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return file;
};

describe("sniffSource", () => {
  const sniff = (name, bytes) => sniffSource(write(name, bytes), name, Buffer.byteLength(bytes));

  it("passes each format's files as they start", async () => {
    const stl = Buffer.alloc(84 + 50);
    stl.writeUInt32LE(1, 80);
    for (const [name, bytes] of [
      ["ring.glb", glb()],
      ["ring.gltf", '﻿  {"asset":{"version":"2.0"}}'],
      ["ring.3dm", Buffer.from("3D Geometry File Format       80 rest")],
      ["ring.STEP", "ISO-10303-21;\nHEADER;"],
      ["ring.igs", `${"Mist fixture".padEnd(72)}S      1\n`],
      ["ring.fbx", Buffer.from("Kaydara FBX Binary  \0\x1a\0")],
      ["ring.obj", OBJ],
      ["ring.stl", stl],
      ["ascii.stl", "solid ring\nfacet normal 0 0 1\n"],
      ["ring.ply", "ply\nformat ascii 1.0\n"],
      ["ring.3mf", Buffer.from("PK\x03\x04rest", "latin1")],
    ]) {
      await expect(sniff(name, bytes), name).resolves.toBeUndefined();
    }
  });

  it("fails a file that isn't what its name says as unreadable, before any parser sees it", async () => {
    for (const [name, bytes] of [
      ["ring.3dm", "ISO-10303-21;"],
      ["ring.step", "3D Geometry File Format"],
      ["ring.glb", '{"asset":{}}'],
      ["ring.obj", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])],
      ["ring.stl", Buffer.alloc(100)],
      ["ring.dwg", "AC1032"],
    ]) {
      await expect(sniff(name, bytes), name).rejects.toMatchObject({ code: "model_unreadable", retryable: false });
    }
  });
});

describe("downloadConvertInputs", () => {
  /** A job whose downloads write `bodies[path]`, or throw `errors[path]`. */
  const fakeJob = (bodies, errors = {}) => ({
    download: async (location, dest, { maxBytes }) => {
      calls.push([location.path, maxBytes]);
      if (errors[location.path]) throw errors[location.path];
      writeFileSync(dest, bodies[location.path]);
      return bodies[location.path].length;
    },
  });
  const bodies = { "/render-jobs/7/inputs/source": OBJ, "/render-jobs/7/inputs/companions/0": MTL };

  it("fetches the source and companions with the job's token, at most their size, for the sink's paths", async () => {
    const inputs = await downloadConvertInputs(fakeJob(bodies), PAYLOAD, dir, AbortSignal.timeout(5000));
    expect(calls).toEqual([["/render-jobs/7/inputs/source", OBJ.length], ["/render-jobs/7/inputs/companions/0", MTL.length]]);
    expect([...inputs.keys()]).toEqual(["/inputs/source", "/inputs/companions/0"]);
    expect(readFileSync(inputs.get("/inputs/companions/0"))).toEqual(MTL);
  });

  it("ends the job when a file is gone or isn't the size it was uploaded with", async () => {
    const gone = { "/render-jobs/7/inputs/companions/0": new ApiError("GET /render-jobs/7/inputs/companions/0: 404", 404) };
    await expect(downloadConvertInputs(fakeJob(bodies, gone), PAYLOAD, dir, AbortSignal.timeout(5000))).rejects.toMatchObject({ code: "input_missing", retryable: false });
    const larger = { "/render-jobs/7/inputs/source": new TooLargeError(`/render-jobs/7/inputs/source is larger than ${OBJ.length} bytes`) };
    await expect(downloadConvertInputs(fakeJob(bodies, larger), PAYLOAD, dir, AbortSignal.timeout(5000))).rejects.toMatchObject({ code: "input_missing" });
    const shorter = { ...bodies, "/render-jobs/7/inputs/source": OBJ.subarray(0, 10) };
    await expect(downloadConvertInputs(fakeJob(shorter), PAYLOAD, dir, AbortSignal.timeout(5000))).rejects.toThrow(`ring.obj is 10 bytes, not the ${OBJ.length} it was uploaded with.`);
  });

  it("refuses a payload without a place for each file, and a source that isn't its format", async () => {
    await expect(downloadConvertInputs(fakeJob(bodies), { ...PAYLOAD, companions: [] }, dir, AbortSignal.timeout(5000))).rejects.toMatchObject({ code: "invalid_spec" });
    const renamed = { ...bodies, "/render-jobs/7/inputs/source": Buffer.concat([Buffer.from([0]), OBJ.subarray(1)]) };
    await expect(downloadConvertInputs(fakeJob(renamed), PAYLOAD, dir, AbortSignal.timeout(5000))).rejects.toMatchObject({ code: "model_unreadable" });
  });
});

describe("what the page made", () => {
  it("reads the size of a lossy, lossless or extended WebP, and nothing else", () => {
    expect(webpSize(webp(512, 512))).toEqual({ width: 512, height: 512 });
    const lossless = Buffer.alloc(30);
    lossless.write("RIFF", 0, "latin1");
    lossless.write("WEBPVP8L", 8, "latin1");
    lossless[20] = 0x2f;
    lossless.writeUInt32LE((300 - 1) | ((150 - 1) << 14), 21);
    expect(webpSize(lossless)).toEqual({ width: 300, height: 150 });
    const extended = Buffer.alloc(30);
    extended.write("RIFF", 0, "latin1");
    extended.write("WEBPVP8X", 8, "latin1");
    extended.writeUIntLE(511, 24, 3);
    extended.writeUIntLE(255, 27, 3);
    expect(webpSize(extended)).toEqual({ width: 512, height: 256 });
    expect(webpSize(Buffer.from("\x89PNG\r\n\x1a\n".padEnd(40, "\0"), "latin1"))).toBeNull();
  });

  it("passes a GLB the API stores, and fails a cut, mislabelled or empty one", async () => {
    const good = glb();
    await expect(checkGlbFile(write("good.glb", good), good.length)).resolves.toBeUndefined();
    const cut = good.subarray(0, good.length - 4);
    await expect(checkGlbFile(write("cut.glb", cut), cut.length)).rejects.toThrow(/header says/);
    const lying = glb({ length: 9999 });
    await expect(checkGlbFile(write("lying.glb", lying), lying.length)).rejects.toThrow(/header says 9999/);
    const empty = glb({ meshes: [] });
    await expect(checkGlbFile(write("empty.glb", empty), empty.length)).rejects.toThrow(/no meshes/);
  });

  /** A sink holding `files` as the page posted them. */
  const sinkWith = (files) => ({
    files: new Map(Object.entries(files).map(([name, [contentType, bytes]]) => [name, { path: write(name, bytes), bytes: bytes.length, sha256: "s", contentType }])),
  });
  const posted = (names) => ({ renderer: SWIFTSHADER, outputs: names.map((name) => ({ name, content_type: "x" })) });
  const finish = (files, names = Object.keys(files), spec = SPEC) => startConvertOutputs({ spec }).finish(posted(names), sinkWith(files));
  const ALL = {
    "model.glb": ["model/gltf-binary", glb()],
    "thumbnail.webp": ["image/webp", webp(512, 512)],
    "conversion.json": ["application/json", Buffer.from(JSON.stringify(report()))],
  };

  it("makes the outputs the API plans: the model and report, the thumbnail when there is one, at its size", async () => {
    const outputs = await finish(ALL);
    expect(outputs.map(({ name, content_type, width, height, label }) => ({ name, content_type, width, height, label }))).toEqual([
      { name: "model.glb", content_type: "model/gltf-binary", width: null, height: null, label: null },
      { name: "thumbnail.webp", content_type: "image/webp", width: 512, height: 512, label: null },
      { name: "conversion.json", content_type: "application/json", width: null, height: null, label: null },
    ]);
    const withoutThumbnail = { "model.glb": ALL["model.glb"], "conversion.json": ALL["conversion.json"] };
    expect((await finish(withoutThumbnail)).map(({ name }) => name)).toEqual(["model.glb", "conversion.json"]);
  });

  it("fails clearly instead of uploading a bad file", async () => {
    await expect(finish({ "model.glb": ALL["model.glb"] })).rejects.toThrow(/a convert job makes model.glb, conversion.json/);
    await expect(finish({ ...ALL, "model.glb": ["model/gltf-binary", Buffer.from("solid stl")] })).rejects.toThrow(/not a GLB/);
    await expect(finish({ ...ALL, "thumbnail.webp": ["image/webp", webp(300, 150)] })).rejects.toThrow(/300x150; a convert job's thumbnail is a 512 px WebP/);
    await expect(finish({ ...ALL, "thumbnail.webp": ["image/png", webp(512, 512)] })).rejects.toThrow(/came as image\/png/);
    await expect(finish({ ...ALL, "conversion.json": ["application/json", Buffer.from("{")] })).rejects.toThrow(/doesn't parse/);
    const extra = Buffer.from(JSON.stringify({ ...report(), scene: {} }));
    await expect(finish({ ...ALL, "conversion.json": ["application/json", extra] })).rejects.toThrow(/its fields are/);
    const badRole = Buffer.from(JSON.stringify(report({ roles: { "Metal 1": "stone" } })));
    await expect(finish({ ...ALL, "conversion.json": ["application/json", badRole] })).rejects.toThrow(/a role is not/);
  });

  it("fails a model over the plan's cap for good", async () => {
    const over = Buffer.from(JSON.stringify(report({ polygon_count: 100_001 })));
    await expect(finish({ ...ALL, "conversion.json": ["application/json", over] })).rejects.toMatchObject({ code: "over_polygon_cap", retryable: false });
  });

  it("fails with the page's code what it calls the design's fault, and anything else to be tried again", () => {
    const failure = (code) => ({ failure: { code, message: `${code}!` } });
    expect(convertPageFailure("x", failure("over_polygon_cap"))).toMatchObject({ code: "over_polygon_cap", retryable: false, message: "over_polygon_cap!" });
    expect(convertPageFailure("x", failure("model_unreadable"))).toMatchObject({ code: "model_unreadable", retryable: false });
    expect(convertPageFailure("x", failure("invalid_spec"))).toMatchObject({ code: "invalid_spec", retryable: false });
    expect(convertPageFailure("x", failure("unknown"))).toMatchObject({ code: "unknown", retryable: true });
    expect(convertPageFailure("the page crashed", null)).toMatchObject({ code: "unknown", message: "the page crashed" });
  });
});

describe("a convert job", () => {
  /** The API as the job sees it. */
  function fakeApi(overrides = {}) {
    const record = (name, ...args) => calls.push([name, ...args]);
    const job = {
      id: 7,
      payload: async () => (record("payload"), structuredClone(PAYLOAD)),
      heartbeat: async (body) => (record("heartbeat", body), { lease_expires_at: "2026-10-06T12:00:00Z", cancel: false }),
      download: async (source, dest) => {
        record("download", source);
        const bytes = source.path.endsWith("/source") ? OBJ : MTL;
        writeFileSync(dest, bytes);
        return bytes.length;
      },
      uploads: async (files) => (record("uploads", files), { files: files.map(({ name }) => ({ name, key: `customers/7/renders/7/${name}`, url: `/render-jobs/7/uploads/${name}`, headers: {} })) }),
      put: async (target, filePath) => record("put", target.name, readFileSync(filePath)),
      complete: async (body) => (record("complete", body), { id: 7, status: "completed" }),
      fail: async (body) => (record("fail", body), { id: 7, status: "failed" }),
      read: async () => ({ body: Buffer.from(""), contentType: "text/plain" }),
      ...overrides,
    };
    return { job: () => job };
  }

  /** What the convert mode does: reads the design's files from the sink, posts the three it makes. */
  async function convertOnSink({ sink }) {
    const headers = { [SINK_TOKEN_HEADER]: sink.token };
    const read = async (route) => Buffer.from(await (await fetch(`${sink.url}${route}`, { headers })).arrayBuffer());
    calls.push(["page read", (await read("/inputs/source")).equals(OBJ), (await read("/inputs/companions/0")).equals(MTL)]);
    for (const [name, type, body] of [["model.glb", "model/gltf-binary", glb()], ["thumbnail.webp", "image/webp", webp(512, 512)], ["conversion.json", "application/json", JSON.stringify(report())]]) {
      const response = await fetch(`${sink.url}/files/${name}`, { method: "POST", headers: { ...headers, "Content-Type": type }, body });
      if (!response.ok) throw new Error(`sink ${response.status}`);
    }
    return { state: "done", result: { renderer: SWIFTSHADER, outputs: CONVERT_OUTPUT_NAMES.map((name) => ({ name, content_type: "x" })) } };
  }

  /** A browser whose page runs `page(handOff)` once the convert mode is open, recording what it was handed. */
  function fakeBrowser(page = convertOnSink) {
    return {
      once() {},
      off() {},
      async newContext() {
        let handOff = null;
        return {
          route: async () => {},
          routeWebSocket: async () => {},
          addInitScript: async (_script, arg) => {
            handOff = arg;
            calls.push(["hand-off", arg.payload]);
          },
          newPage: async () => {
            let outcome;
            return {
              on() {},
              once() {},
              goto: async (url) => calls.push(["goto", url]),
              waitForFunction: async () => {
                outcome = await page(handOff);
              },
              evaluate: async () => outcome,
            };
          },
          close: async () => {},
        };
      },
    };
  }

  const run = (api = fakeApi(), browser = fakeBrowser()) =>
    runJob({
      claim: { job_id: 7, job_token: "job-secret", kind: "convert", lease_seconds: 120, heartbeat_seconds: 20 },
      api,
      browser,
      config: { harnessUrl: HARNESS, profileName: "swiftshader", tmpDir: dir, assetPrefixes: [{ prefix: "https://assets.example.com/", from: "https://assets.example.com/" }], ffmpegPath: "ffmpeg" },
      assets: { vendored: new Set(), get: async () => ({ path: "/dev/null", contentType: "text/plain" }) },
      stopping: new AbortController().signal,
      log: () => {},
    });
  const called = (name) => calls.filter(([call]) => call === name).map(([, ...args]) => args);

  it("converts in the convert mode and completes with the files the API plans", async () => {
    const { outcome } = await run();

    expect(outcome).toBe("completed");
    expect(called("goto")).toEqual([[`${HARNESS}/render-harness?mode=convert`]]);
    expect(called("page read")).toEqual([[true, true]]);
    // The page gets the spec and its limits: no storage location, no token.
    const [[handed]] = called("hand-off");
    expect(Object.keys(handed).sort()).toEqual(["kind", "limits", "spec"]);
    expect(called("uploads")[0][0].map(({ name, content_type }) => [name, content_type])).toEqual([
      ["model.glb", "model/gltf-binary"],
      ["thumbnail.webp", "image/webp"],
      ["conversion.json", "application/json"],
    ]);
    const [[body]] = called("complete");
    expect(body.outputs.map(({ name, key, width, height, label }) => ({ name, key, width, height, label }))).toEqual([
      { name: "model.glb", key: "customers/7/renders/7/model.glb", width: null, height: null, label: null },
      { name: "thumbnail.webp", key: "customers/7/renders/7/thumbnail.webp", width: 512, height: 512, label: null },
      { name: "conversion.json", key: "customers/7/renders/7/conversion.json", width: null, height: null, label: null },
    ]);
    expect(body.renderer).toEqual(SWIFTSHADER);
    expect(await readdir(dir)).toEqual([]);
  });

  it("fails a design the page can't read for good, and uploads nothing", async () => {
    const unreadable = async () => ({ state: "error:Could not parse this .obj", result: { failure: { code: "model_unreadable", message: "Could not parse this .obj" } } });
    const { outcome } = await run(fakeApi(), fakeBrowser(unreadable));
    expect(outcome).toBe("failed");
    expect(called("fail")).toEqual([[{ error: "Could not parse this .obj", code: "model_unreadable", retryable: false }]]);
    expect(called("uploads")).toEqual([]);
  });

  it("fails a file over the API's cap for good", async () => {
    const api = fakeApi({ uploads: async () => {
      throw new ApiError("POST /render-jobs/7/uploads: 400 files[0].bytes: at most 104857600 bytes a file", 400);
    } });
    await run(api);
    expect(called("fail")[0][0]).toMatchObject({ code: "over_limit", retryable: false });
  });
});
