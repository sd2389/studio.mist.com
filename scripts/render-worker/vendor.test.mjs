import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadVendor, VENDORED_FILES, vendorFiles } from "./vendor.mjs";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const ENTRIES = [
  { url: "https://cdn.example.com/npm/kernel@1.0.0/kernel.js", sha256: sha256("glue"), contentType: "application/javascript" },
  { url: "https://cdn.example.com/npm/kernel@1.0.0/kernel.wasm", sha256: sha256("\0asm"), contentType: "application/wasm" },
];

let dir;
let fetched;

/** A CDN answering each URL with `bodies[url]`. */
const fakeCdn = (bodies) => async (url) => {
  fetched.push(url);
  return bodies[url] === undefined ? new Response("", { status: 404 }) : new Response(bodies[url]);
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "vendor-test-"));
  fetched = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the converters' vendored files", () => {
  it("pins every file the convert mode's loaders fetch from a CDN", () => {
    expect(VENDORED_FILES.map(({ url }) => url)).toEqual([
      "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.js",
      "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.wasm",
      "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js",
      "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.wasm",
      "https://www.gstatic.com/draco/versioned/decoders/1.5.5/draco_wasm_wrapper.js",
      "https://www.gstatic.com/draco/versioned/decoders/1.5.5/draco_decoder.wasm",
    ]);
    // The loaders ask for exactly these (src/lib/convert/loaders/).
    const loaders = ["rhino.ts", "occt-worker.ts", "gltf.ts"].map((file) => readFileSync(path.join("src/lib/convert/loaders", file), "utf8")).join("\n");
    expect(loaders).toContain("https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/");
    expect(loaders).toContain("https://cdn.jsdelivr.net/npm/occt-import-js@${OCCT_VERSION}/dist/");
    expect(loaders).toMatch(/OCCT_VERSION = "0\.0\.23"/);
    expect(loaders).toContain("https://www.gstatic.com/draco/versioned/decoders/1.5.5/");
    for (const { sha256: hash } of VENDORED_FILES) expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fetches each file once, keeping only the bytes its hash names", async () => {
    const cdn = fakeCdn({ [ENTRIES[0].url]: "glue", [ENTRIES[1].url]: "\0asm" });
    expect(await vendorFiles(dir, { entries: ENTRIES, fetch: cdn })).toBe(2);
    expect(await vendorFiles(dir, { entries: ENTRIES, fetch: cdn })).toBe(0);
    expect(fetched).toEqual(ENTRIES.map(({ url }) => url));

    const vendor = await loadVendor(dir, ENTRIES);
    expect(vendor.missing).toEqual([]);
    expect(vendor.files.get(ENTRIES[1].url)).toEqual({ path: path.join(dir, ENTRIES[1].sha256), contentType: "application/wasm", bytes: 4 });
  });

  it("refuses a file that isn't the pinned one, and keeps nothing of it", async () => {
    const cdn = fakeCdn({ [ENTRIES[0].url]: "tampered glue", [ENTRIES[1].url]: "\0asm" });
    await expect(vendorFiles(dir, { entries: ENTRIES, fetch: cdn })).rejects.toThrow(/has SHA-256 [0-9a-f]{64}, not the pinned/);
    expect(await readdir(dir)).toEqual([]);
    await expect(vendorFiles(dir, { entries: ENTRIES, fetch: fakeCdn({}) })).rejects.toThrow(/404/);
  });

  it("counts a file that was changed on disk as missing", async () => {
    await vendorFiles(dir, { entries: ENTRIES, fetch: fakeCdn({ [ENTRIES[0].url]: "glue", [ENTRIES[1].url]: "\0asm" }) });
    writeFileSync(path.join(dir, ENTRIES[0].sha256), "glue, edited");
    const vendor = await loadVendor(dir, ENTRIES);
    expect(vendor.missing).toEqual([ENTRIES[0].url]);
    expect([...vendor.files.keys()]).toEqual([ENTRIES[1].url]);
    expect((await loadVendor(path.join(dir, "nowhere"), ENTRIES)).missing).toHaveLength(2);
  });
});
