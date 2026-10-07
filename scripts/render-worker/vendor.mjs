#!/usr/bin/env node
/*
 * The converters' own files (ADR 0006, "Conversion jobs"): what the convert mode's loaders fetch
 * from public CDNs as the upload page does, rhino3dm and occt-import-js from jsDelivr and Draco's
 * decoder from gstatic, each pinned here by its SHA-256. The worker image is built with them
 * (`node scripts/render-worker/vendor.mjs <dir>` fetches each and checks its hash), in its
 * read-only root, and a job's page asking for one of these URLs gets the vendored file: a
 * conversion reaches no CDN, depends on none being up, and runs only code these hashes name. A
 * worker that converts claims nothing until every file is there with its hash.
 *
 * To move to another version, change the loader's URL (src/lib/convert/loaders/) and its entry
 * here together; the old hash then names a file no page asks for.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VENDORED_FILES = [
  // Rhino3dmLoader, src/lib/convert/loaders/rhino.ts.
  {
    url: "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.js",
    sha256: "ae12fa5d635b4fb6f66d7328a9bde1dfac26f8d021dcf2335e809b69d136fce4",
    contentType: "application/javascript; charset=utf-8",
  },
  {
    url: "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.wasm",
    sha256: "c831ea5e235603437f6f8f260b0083eebca186a75f8be03efbfc2bb06aa37e21",
    contentType: "application/wasm",
  },
  // OpenCascade for STEP and IGES, src/lib/convert/loaders/occt-worker.ts.
  {
    url: "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js",
    sha256: "3fb44ce11d00611f9b3f3c5775d520ebab48930c1f08279b7b1316f05f0d3379",
    contentType: "application/javascript; charset=utf-8",
  },
  {
    url: "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.wasm",
    sha256: "33391fc9d94ea5c869a6718488bf0a9a464222bac9bdc764dfe1690cef281952",
    contentType: "application/wasm",
  },
  // Draco's decoder for a compressed glTF, src/lib/convert/loaders/gltf.ts (and drei's useGLTF).
  {
    url: "https://www.gstatic.com/draco/versioned/decoders/1.5.5/draco_wasm_wrapper.js",
    sha256: "b93f6384147828f857456c84845f4dbceada5b7a8455991109c853e236a1f018",
    contentType: "text/javascript",
  },
  {
    url: "https://www.gstatic.com/draco/versioned/decoders/1.5.5/draco_decoder.wasm",
    sha256: "0103c8bff79532c2f1a496dd9ea0764ac692ed8585d9136596ef9f043873a61f",
    contentType: "application/wasm",
  },
];

const FETCH_TIMEOUT_MS = 2 * 60_000;

const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Each file is stored under its hash, so a file that is there under its name is the pinned one. */
const fileOf = (dir, entry) => path.join(dir, entry.sha256);

async function readPinned(dir, entry) {
  try {
    const bytes = await readFile(fileOf(dir, entry));
    return sha256Of(bytes) === entry.sha256 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * The vendored files in `dir` whose bytes have their pinned hash: `files`, URL →
 * `{ path, contentType, bytes }`, and the URLs of those that are missing or wrong.
 *
 * @returns {Promise<{ dir: string, files: Map<string, { path: string, contentType: string, bytes: number }>, missing: string[] }>}
 */
export async function loadVendor(dir, entries = VENDORED_FILES) {
  const files = new Map();
  const missing = [];
  for (const entry of entries) {
    const bytes = await readPinned(dir, entry);
    if (bytes) files.set(entry.url, { path: fileOf(dir, entry), contentType: entry.contentType, bytes: bytes.length });
    else missing.push(entry.url);
  }
  return { dir, files, missing };
}

/**
 * Fetches every file `dir` lacks, refusing one whose bytes aren't the pinned ones, and resolves
 * with how many it fetched. Files already there with their hash are kept.
 */
export async function vendorFiles(dir, { entries = VENDORED_FILES, fetch = globalThis.fetch, log = () => {} } = {}) {
  await mkdir(dir, { recursive: true });
  let fetched = 0;
  for (const entry of entries) {
    if (await readPinned(dir, entry)) continue;
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status !== 200) throw new Error(`GET ${entry.url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const found = sha256Of(bytes);
    if (found !== entry.sha256) throw new Error(`${entry.url} has SHA-256 ${found}, not the pinned ${entry.sha256}`);
    const partial = `${fileOf(dir, entry)}.${randomBytes(6).toString("hex")}.part`;
    try {
      await writeFile(partial, bytes);
      await rename(partial, fileOf(dir, entry));
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    fetched += 1;
    log(`vendored ${entry.url} (${bytes.length} bytes)`);
  }
  return fetched;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] || process.env.WORKER_VENDOR_DIR || "");
  if (!process.argv[2] && !process.env.WORKER_VENDOR_DIR) {
    console.error("usage: node scripts/render-worker/vendor.mjs <dir> (or set WORKER_VENDOR_DIR)");
    process.exit(2);
  }
  vendorFiles(dir, { log: (message) => console.log(`[vendor] ${message}`) }).then(
    (fetched) => console.log(`[vendor] ${dir}: ${VENDORED_FILES.length} files, ${fetched} fetched now, every one its pinned hash`),
    (error) => {
      console.error(`[vendor] ${error.message}`);
      process.exit(1);
    },
  );
}
