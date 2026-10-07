import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "./api.mjs";
import { runArchiveJob, writeArchiveParts } from "./archive.mjs";
import { JobFailure } from "./failure.mjs";

/*
 * A batch archive (ADR 0006, "Results"): fixture outputs of a few designs go into ZIP parts, the
 * manifest first, each file once in some part, no part past its size unless one file alone is.
 */

const KB = 1024;
const MANIFEST = "sku,name,status\r\nR-1,Solitaire,done\r\nR-2,Halo,done\r\n";
/** What each design made, by its path in the archive, and its size. */
const OUTPUTS = [
  ["R-1/thumbnail.webp", 6 * KB],
  ["R-1/stills/front.jpg", 30 * KB],
  ["R-1/stills/side.jpg", 20 * KB],
  ["R-1/video/turntable.mp4", 150 * KB], // larger than a part: it goes alone
  ["R-2/thumbnail.webp", 5 * KB],
  ["R-2/stills/front.jpg", 25 * KB],
  ["R-2/spin/spin.zip", 40 * KB],
];
const PART_BYTES = 64 * KB;

let dir;
let fixtures;
let store;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "archive-test-job-"));
  fixtures = await mkdtemp(path.join(os.tmpdir(), "archive-test-fixtures-"));
  store = await mkdtemp(path.join(os.tmpdir(), "archive-test-store-"));
  OUTPUTS.forEach(([, bytes], index) => {
    writeFileSync(path.join(fixtures, `${index}`), Buffer.alloc(bytes, index + 1));
  });
});

afterEach(async () => {
  for (const folder of [dir, fixtures, store]) await rm(folder, { recursive: true, force: true });
});

const fixture = (index) => readFileSync(path.join(fixtures, `${index}`));

/** The payload's files: where each goes, where to fetch it, its size when the API knows it (not a thumbnail's). */
const payloadFiles = () =>
  OUTPUTS.map(([name, bytes], index) => ({
    path: name,
    source: { path: `/render-jobs/9/inputs/renders/${index}` },
    bytes: name.endsWith("thumbnail.webp") ? null : bytes,
    max_bytes: name.endsWith("thumbnail.webp") ? 2 * 1024 * KB : bytes,
  }));

/** Copies a fixture to `dest`, as a download would, by the index its route ends with. */
function fetchFixture(file, dest) {
  const source = path.join(fixtures, file.source.path.split("/").pop());
  copyFileSync(source, dest);
  return statSync(dest).size;
}

/** Every part's entries, by part, read back with another unzipper. */
function readParts(parts) {
  return parts.map((part) => unzipSync(readFileSync(part.stored)));
}

async function writeFixtureParts({ partBytes = PART_BYTES, maxParts = 10 } = {}) {
  const manifest = path.join(dir, "manifest");
  writeFileSync(manifest, MANIFEST);
  const parts = [];
  const result = await writeArchiveParts({
    manifest: { name: "manifest.csv", path: manifest, bytes: Buffer.byteLength(MANIFEST) },
    files: payloadFiles(),
    partBytes,
    maxParts,
    partName: (number) => `Rings-part-${number}.zip`,
    dir,
    fetchFile: fetchFixture,
    onPart: async (part) => {
      // The part is deleted once this returns, as once it is uploaded: keep a copy to read.
      const stored = path.join(store, part.name);
      copyFileSync(part.path, stored);
      parts.push({ ...part, stored });
    },
  });
  return { parts, result };
}

describe("writeArchiveParts", () => {
  it("puts every file in exactly one part, the manifest first, each part within its size", async () => {
    const { parts, result } = await writeFixtureParts();

    const contents = readParts(parts);
    const names = contents.flatMap((entries) => Object.keys(entries));
    expect(names.sort()).toEqual(["manifest.csv", ...OUTPUTS.map(([name]) => name)].sort());
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(contents[0])[0]).toBe("manifest.csv");
    expect(new TextDecoder().decode(contents[0]["manifest.csv"])).toBe(MANIFEST);
    for (const entries of contents.slice(1)) expect(entries["manifest.csv"]).toBeUndefined();
    OUTPUTS.forEach(([name], index) => {
      const part = contents.find((entries) => entries[name]);
      expect(Buffer.from(part[name])).toEqual(fixture(index));
    });
    parts.forEach((part, index) => {
      expect(part.name).toBe(`Rings-part-${index + 1}.zip`);
      expect(part.bytes).toBe(statSync(part.stored).size);
      expect(part.files).toBe(Object.keys(contents[index]).length);
      if (part.files > 1) expect(part.bytes).toBeLessThanOrEqual(PART_BYTES);
    });
    expect(result).toEqual({ parts: parts.length, entries: OUTPUTS.length + 1 });
    // The file larger than a part is one alone; the order the designs were dropped in holds.
    expect(contents.map((entries) => Object.keys(entries))).toEqual([
      ["manifest.csv", "R-1/thumbnail.webp", "R-1/stills/front.jpg", "R-1/stills/side.jpg"],
      ["R-1/video/turntable.mp4"],
      ["R-2/thumbnail.webp", "R-2/stills/front.jpg"],
      ["R-2/spin/spin.zip"],
    ]);
    expect(readdirSync(dir)).toEqual([]); // each file and part is gone once in or handed on
  });

  it("makes one part when everything fits", async () => {
    const { parts } = await writeFixtureParts({ partBytes: 1024 * KB });

    expect(parts.map((part) => [part.name, part.files])).toEqual([["Rings-part-1.zip", OUTPUTS.length + 1]]);
  });

  it("stops as over_limit past the parts its job may make", async () => {
    const failure = await writeFixtureParts({ maxParts: 2 }).catch((error) => error);

    expect(failure).toBeInstanceOf(JobFailure);
    expect([failure.code, failure.retryable]).toEqual(["over_limit", false]);
  });
});

/** Cases the API counts too (parts_needed in backend/app/features/render_jobs/archive_spec.py, test_archive_packing.py). */
const PACKING = JSON.parse(readFileSync(new URL("../../backend/tests/fixtures/archive_packing.json", import.meta.url), "utf8"));

describe("the parts the API counts", () => {
  it.each(PACKING.cases)("are the parts the worker writes: $name", async ({ part_bytes: partBytes, manifest_bytes: manifestBytes, files, parts: expected }) => {
    const manifest = path.join(dir, "manifest");
    writeFileSync(manifest, "m".repeat(manifestBytes));
    files.forEach(([, bytes], index) => writeFileSync(path.join(fixtures, `${index}`), Buffer.alloc(bytes, index + 1)));
    const written = [];
    await writeArchiveParts({
      manifest: { name: PACKING.manifest_name, path: manifest, bytes: manifestBytes },
      files: files.map(([name], index) => ({ path: name, source: { path: `/inputs/${index}` } })),
      partBytes,
      maxParts: 100,
      partName: (number) => `case-part-${number}.zip`,
      dir,
      fetchFile: fetchFixture,
      onPart: async (part) => {
        const stored = path.join(store, part.name);
        copyFileSync(part.path, stored);
        written.push({ ...part, stored });
      },
    });

    expect(written.length).toBe(expected);
    const names = readParts(written).flatMap((entries) => Object.keys(entries));
    expect(names).toEqual([PACKING.manifest_name, ...files.map(([name]) => name)]);
    for (const part of written) if (part.files > 1) expect(part.bytes).toBeLessThanOrEqual(partBytes);
  });
});

describe("runArchiveJob", () => {
  const SPEC = { batch_id: 31, stem: "Rings", part_bytes: PART_BYTES, max_parts: 10 };

  function fakeApi(overrides = {}) {
    const calls = [];
    const job = {
      id: 9,
      payload: async () => ({ kind: "batch_archive", spec: SPEC, manifest_name: "manifest.csv", manifest: MANIFEST, files: payloadFiles(), limits: { max_runtime_seconds: 1800 } }),
      heartbeat: async (body) => (calls.push(["heartbeat", body]), { cancel: false }),
      download: async (source, dest) => fetchFixture({ source }, dest),
      uploads: async (files) => ({ files: files.map(({ name }) => ({ name, key: `customers/1/renders/9/${name}`, url: `https://storage.test/${name}`, headers: {} })) }),
      put: async (target, filePath) => {
        copyFileSync(filePath, path.join(store, target.name));
        calls.push(["put", target.name]);
      },
      complete: async (body) => (calls.push(["complete", body]), { id: 9, status: "completed" }),
      fail: async (body) => (calls.push(["fail", body]), { id: 9, status: "failed" }),
      ...overrides,
    };
    return { calls, api: { job: () => job } };
  }

  const run = (api) =>
    runArchiveJob({ claim: { job_id: 9, job_token: "t", kind: "batch_archive", heartbeat_seconds: 20 }, api, config: { tmpDir: os.tmpdir() }, stopping: new AbortController().signal, log: () => {} });

  it("uploads each part as it is written and completes with all of them, nothing drawn", async () => {
    const { calls, api } = fakeApi();

    expect(await run(api)).toEqual({ outcome: "completed", recycleBrowser: false });

    const [, body] = calls.find(([name]) => name === "complete");
    expect(body.renderer).toBeNull();
    expect(body.outputs.map((output) => output.name)).toEqual(["Rings-part-1.zip", "Rings-part-2.zip", "Rings-part-3.zip", "Rings-part-4.zip"]);
    expect(body.outputs.reduce((total, output) => total + output.meta.files, 0)).toBe(OUTPUTS.length + 1);
    for (const output of body.outputs) {
      expect(output).toMatchObject({ content_type: "application/zip", width: null, height: null, label: null, key: `customers/1/renders/9/${output.name}` });
      expect(output.bytes).toBe(statSync(path.join(store, output.name)).size);
      expect(output.meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const archived = body.outputs.flatMap((output) => Object.keys(unzipSync(readFileSync(path.join(store, output.name)))));
    expect(archived.sort()).toEqual(["manifest.csv", ...OUTPUTS.map(([name]) => name)].sort());
    // Each part goes up before the next is written; the bar only moves forward.
    expect(calls.filter(([name]) => name === "put").map(([, part]) => part)).toEqual(body.outputs.map((output) => output.name));
    const progress = calls.filter(([name]) => name === "heartbeat").map(([, beat]) => beat.progress);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(Math.max(...progress)).toBeLessThanOrEqual(0.95);
  });

  it("fails for good when a file is gone, and completes nothing", async () => {
    const { calls, api } = fakeApi({
      download: async () => {
        throw new ApiError("GET storage.test: 404", 404);
      },
    });

    expect((await run(api)).outcome).toBe("failed");

    const [, failure] = calls.find(([name]) => name === "fail");
    expect([failure.code, failure.retryable]).toEqual(["input_missing", false]);
    expect(calls.some(([name]) => name === "complete")).toBe(false);
  });

  it("fails a file whose size isn't the one stored", async () => {
    const { calls, api } = fakeApi({
      download: async (source, dest) => {
        writeFileSync(dest, Buffer.alloc(3));
        return 3;
      },
    });

    await run(api);

    expect(calls.find(([name]) => name === "fail")[1].code).toBe("input_missing");
  });
});
