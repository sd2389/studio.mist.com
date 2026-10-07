import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const FETCH_TIMEOUT_MS = 2 * 60_000;
/** One file at most; a catalogue HDR is tens of MB. */
export const MAX_ASSET_BYTES = 512 * 1024 * 1024;

export class AssetError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "AssetError";
    this.status = status;
  }
}

function sizeCap(limit, label) {
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      meter.bytes += chunk.length;
      done(meter.bytes > limit ? new AssetError(`${label} is larger than ${limit} bytes`) : null, chunk);
    },
  });
  meter.bytes = 0;
  return meter;
}

/**
 * A disk cache of what a job's page loads from outside the harness: catalogue HDRs, backgrounds
 * and grounds on the asset origin, and the decoders models need (Draco's WASM, from gstatic).
 * The worker fetches each URL once and serves it from disk through `context.route` after that,
 * so a warm worker renders without waiting on, or depending on, those hosts. Keyed by the whole
 * URL; past `maxBytes` the least recently used files go. The converters' vendored files
 * (`loadVendor` in vendor.mjs) are answered from where they are and never fetched.
 *
 * @param {{ dir: string, maxBytes?: number, fetch?: typeof fetch, log?: (message: string) => void,
 *   vendor?: { files: Map<string, { path: string, contentType: string, bytes: number }> } | null }} options
 */
export function createAssetCache({ dir, maxBytes = 2 * 1024 ** 3, fetch = globalThis.fetch, log = () => {}, vendor = null }) {
  const downloading = new Map();
  let ready = null;
  const fileOf = (url) => path.join(dir, createHash("sha256").update(url).digest("hex"));

  async function stored(url) {
    const file = fileOf(url);
    try {
      const meta = JSON.parse(await readFile(`${file}.json`, "utf8"));
      const now = new Date();
      await utimes(file, now, now);
      return { path: file, contentType: meta.contentType, bytes: meta.bytes, cached: true };
    } catch {
      return null;
    }
  }

  /** Drops the least recently used files until the cache fits in `maxBytes`. */
  async function evict() {
    const entries = [];
    for (const name of await readdir(dir)) {
      if (!/^[0-9a-f]{64}$/.test(name)) continue;
      const info = await stat(path.join(dir, name)).catch(() => null);
      if (info) entries.push({ file: path.join(dir, name), bytes: info.size, usedAt: info.mtimeMs });
    }
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    for (const entry of entries.sort((a, b) => a.usedAt - b.usedAt)) {
      if (total <= maxBytes) break;
      await rm(`${entry.file}.json`, { force: true });
      await rm(entry.file, { force: true });
      total -= entry.bytes;
    }
  }

  async function download(url) {
    const label = new URL(url).host;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status !== 200 || !response.body) {
      await response.arrayBuffer().catch(() => {});
      throw new AssetError(`GET ${label}: ${response.status}`, response.status);
    }
    const file = fileOf(url);
    const partial = `${file}.${randomBytes(6).toString("hex")}.part`;
    const meter = sizeCap(MAX_ASSET_BYTES, label);
    try {
      await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial));
      await rename(partial, file);
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    await writeFile(`${file}.json`, JSON.stringify({ contentType, bytes: meter.bytes }));
    log(`cached ${label}${new URL(url).pathname} (${meter.bytes} bytes)`);
    evict().catch((error) => log(`cache eviction failed: ${error.message}`));
    return { path: file, contentType, bytes: meter.bytes, cached: false };
  }

  const vendored = vendor?.files ?? new Map();
  return {
    dir,
    /** The URLs answered from the vendored files: a page may load these, whatever its allowlist. */
    vendored: new Set(vendored.keys()),
    /** The file for `url`, fetched first if the cache doesn't have it; one fetch per URL at a time. */
    async get(url) {
      const pinned = vendored.get(url);
      if (pinned) return { ...pinned, cached: true };
      ready ??= mkdir(dir, { recursive: true });
      await ready;
      const hit = await stored(url);
      if (hit) return hit;
      if (!downloading.has(url)) downloading.set(url, download(url).finally(() => downloading.delete(url)));
      return downloading.get(url);
    },
  };
}
