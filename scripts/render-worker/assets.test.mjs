import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAssetCache } from "./assets.mjs";

let dir;
let fetched;

/** A fetch that answers `size` bytes for any URL, or a 404 for a "missing" one, counting calls. */
const fakeFetch = (size = 10) => async (url) => {
  fetched.push(url);
  if (url.includes("missing")) return new Response("nope", { status: 404 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return new Response(Buffer.alloc(size, url.length % 256), { headers: { "Content-Type": "image/vnd.radiance" } });
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "assets-test-"));
  fetched = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the asset cache", () => {
  it("fetches a URL once, at once for every page asking, then serves it from disk", async () => {
    const cache = createAssetCache({ dir: path.join(dir, "cache"), fetch: fakeFetch() });
    const url = "https://assets.example.com/hdri/studio.hdr";
    const [first, second] = await Promise.all([cache.get(url), cache.get(url)]);
    const third = await cache.get(url);

    expect(fetched).toEqual([url]);
    expect(first.path).toBe(second.path);
    expect(third).toMatchObject({ path: first.path, contentType: "image/vnd.radiance", bytes: 10, cached: true });
    expect(readFileSync(third.path)).toHaveLength(10);
  });

  it("keeps an answer that isn't the file out of the cache", async () => {
    const cache = createAssetCache({ dir, fetch: fakeFetch() });
    await expect(cache.get("https://assets.example.com/missing.hdr")).rejects.toMatchObject({ status: 404 });
    await expect(cache.get("https://assets.example.com/missing.hdr")).rejects.toMatchObject({ status: 404 });
    expect(fetched).toHaveLength(2);
    expect(await readdir(dir)).toEqual([]);
  });

  it("answers a vendored file from where it is, and never fetches it", async () => {
    const url = "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.wasm";
    const vendor = { files: new Map([[url, { path: "/app/vendor/abc", contentType: "application/wasm", bytes: 7 }]]) };
    const cache = createAssetCache({ dir, fetch: fakeFetch(), vendor });

    expect([...cache.vendored]).toEqual([url]);
    expect(await cache.get(url)).toEqual({ path: "/app/vendor/abc", contentType: "application/wasm", bytes: 7, cached: true });
    expect(fetched).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("drops the least recently used files past its size", async () => {
    const cache = createAssetCache({ dir, maxBytes: 25, fetch: fakeFetch(10) });
    const old = await cache.get("https://assets.example.com/a.hdr");
    await utimes(old.path, new Date(2000, 0, 1), new Date(2000, 0, 1));
    await cache.get("https://assets.example.com/b.hdr");
    await cache.get("https://assets.example.com/c.hdr");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const files = (await readdir(dir)).filter((name) => /^[0-9a-f]{64}$/.test(name));
    expect(files).toHaveLength(2);
    expect(files).not.toContain(path.basename(old.path));
  });
});
