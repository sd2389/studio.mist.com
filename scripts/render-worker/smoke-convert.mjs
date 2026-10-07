#!/usr/bin/env node
/*
 * `npm run worker:smoke-convert`: a bulk upload's designs converted into scenes, end to end, on
 * this machine (ADR 0006, E2).
 *
 * Starts an API on a free port from 8790 (a throwaway SQLite database, local storage), the worker
 * build of the app from 3900 (`next start`; HARNESS_BASE_URL names one running already) and a
 * render worker on the CPU pool's settings: the swiftshader profile (WORKER_GPU=metal for a Mac's
 * GPU), claiming `convert` alone, from the converters' vendored files. A Studio user creates a
 * batch of the fixtures in tests/convert/ (a STEP, a 3DM, an OBJ with its MTL, an STL in
 * centimetres given `units: "cm"`) and the demo ring's GLB, plus three designs that must not
 * convert as they are: the OBJ again under a cap it must be decimated to, under one its stone
 * alone passes, and renamed .3dm. Local storage can't sign uploads, so
 * backend/scripts/seed_convert_smoke.py puts the files where the signed PUTs would have; the
 * user confirms them and submits the batch, and the worker converts every design.
 *
 * Then it checks each design as the batch page would read it and its scene as the studio would:
 * the five became scenes with the metal and the stone in their roles, a 512 px WebP thumbnail and
 * a compressed GLB (meshopt and Draco) of the polygons the report counted, at their size in
 * millimetres; the decimated one fits its cap and says so; the other two failed with
 * over_polygon_cap and model_unreadable and gave their credits back; no page reached a CDN. And
 * that the upload page, saving the same files in the same browser, stores the very same GLB (a
 * 3DM's but for the random ids three.js gives the materials the Rhino loader makes, which the
 * model's root carries in its extras). Everything it starts, it stops.
 *
 * Needs a worker build (`BUILD_TARGET=worker npm run build`, in NEXT_BUILD_DIR or .next),
 * Playwright's Chromium and the backend's virtualenv (backend/.venv, or WORKER_SMOKE_PYTHON).
 * The converters' files go to WORKER_VENDOR_DIR (default: the OS's temp folder), fetched from
 * their CDNs once and checked against their pinned hashes.
 */
import { randomBytes } from "node:crypto";
import { copyFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAssetCache } from "./assets.mjs";
import { launchBrowser } from "./browser.mjs";
import { webpSize } from "./convert.mjs";
import { guardContext, pagePolicy } from "./network.mjs";
import {
  api,
  BACKEND,
  backendEnv,
  freePort,
  printLogs,
  PROFILE,
  ROOT,
  run,
  signal,
  sleep,
  smokePython,
  startBackend,
  startWorker,
  startWorkerApp,
  stopAll,
  stopOnInterrupt,
} from "./smoke-stack.mjs";
import { loadVendor, vendorFiles } from "./vendor.mjs";

const FIXTURES = path.join(ROOT, "tests/convert");
const DEMO_RING = path.join(BACKEND, "scripts/fixtures/demo-embed-ring.glb");
const CONVERT_TIMEOUT_MS = 10 * 60_000;
/** The fixtures' ring: a band and a stone, 430 triangles, 24.5 mm at its longest (tests/convert/make-fixtures.mjs). */
const RING = { triangles: 430, longest: 24.473, roles: { "Gem 1": "gem", "Metal 1": "metal" } };
/** The demo ring as the studio stores it, fitted to the viewer: millimetres taken as they come. */
const DEMO = { triangles: 680, longest: 1.76, roles: { "Gem 1": "gem", "Metal 1": "metal" } };
const DECIMATED_CAP = 300;
/** Below the ring's stone (46 triangles): no decimation of its metal can bring it under. */
const STONES_CAP = 40;

/**
 * The batch: each design's files as dropped (folder by SKU, so names may repeat), where they are
 * on this machine, and what the smoke expects of it.
 */
const DESIGNS = [
  { sku: "CONVERT-STEP", files: { "ring.step": "ring.step" }, expect: { ...RING, units: "declared" } },
  { sku: "CONVERT-3DM", files: { "ring.3dm": "ring.3dm" }, expect: { ...RING, units: "declared" } },
  { sku: "CONVERT-OBJ", files: { "ring.obj": "ring.obj", "ring.mtl": "ring.mtl" }, expect: { ...RING, units: "assumed" } },
  { sku: "CONVERT-STL-CM", units: "cm", files: { "ring-cm.stl": "ring-cm.stl" }, expect: { ...RING, units: "override" } },
  { sku: "CONVERT-GLB", files: { "demo-ring.glb": DEMO_RING }, expect: { ...DEMO, units: "assumed" } },
  { sku: "CONVERT-DECIMATED", cap: DECIMATED_CAP, files: { "ring.obj": "ring.obj", "ring.mtl": "ring.mtl" }, expect: { ...RING, units: "assumed", decimated: true } },
  { sku: "CONVERT-STONES", cap: STONES_CAP, files: { "ring.obj": "ring.obj", "ring.mtl": "ring.mtl" }, expect: { failed: "over_polygon_cap" } },
  { sku: "CONVERT-RENAMED", files: { "renamed.3dm": "ring.obj" }, expect: { failed: "model_unreadable" } },
];
/** Designs the upload page saves too, to compare: every format it sizes as the batch does. */
const SAVED_BY_THE_UPLOAD_PAGE = ["CONVERT-STEP", "CONVERT-3DM", "CONVERT-OBJ", "CONVERT-GLB"];

const log = (message) => console.log(`[smoke-convert] ${message}`);
const fixture = (file) => (path.isAbsolute(file) ? file : path.join(FIXTURES, file));
const droppedAs = (design, name) => `${design.sku}/${name}`;

/** The batch request: each design's file and companions, as the bulk upload page sends them. */
function batchRequest() {
  const items = DESIGNS.map((design) => {
    const [source, ...companions] = Object.entries(design.files).map(([name, file]) => ({ filename: droppedAs(design, name), bytes: statSync(fixture(file)).size }));
    return { ...source, companions, sku: design.sku, name: design.sku, ...(design.units ? { units: design.units } : {}) };
  });
  return { name: "Convert smoke", items, options: { decimate: "auto" } };
}

/** Each design's files as dropped → where they are here, for seed_convert_smoke put. */
const storedFiles = () => Object.fromEntries(DESIGNS.flatMap((design) => Object.entries(design.files).map(([name, file]) => [droppedAs(design, name), fixture(file)])));

async function waitForDesigns(call, batchId) {
  const until = Date.now() + CONVERT_TIMEOUT_MS;
  let last = "";
  while (Date.now() < until) {
    const { items } = await call("GET", `/ingest/batches/${batchId}/items?limit=100`);
    const seen = items.map((item) => `${item.sku} ${item.status}${item.error_code ? ` (${item.error_code})` : ""}`).join(", ");
    if (seen !== last) log(seen);
    last = seen;
    if (items.every((item) => ["done", "failed", "canceled"].includes(item.status))) return items;
    await sleep(1000);
  }
  throw new Error(`the designs did not finish within ${CONVERT_TIMEOUT_MS / 60_000} min`);
}

/** The extensions a GLB's JSON says it uses. */
function glbExtensions(glb) {
  if (glb.toString("latin1", 0, 4) !== "glTF") throw new Error("not a GLB");
  return JSON.parse(glb.toString("utf8", 20, 20 + glb.readUInt32LE(12))).extensionsUsed ?? [];
}

/** What the batch page reads of a converted design: its size, triangles and warnings. */
function reportProblems(design, item) {
  const { expect: wanted } = design;
  const problems = [];
  if (Math.abs(item.size_mm - wanted.longest) > 0.01) problems.push(`${item.size_mm} mm long`);
  if (wanted.decimated ? item.polygon_count > design.cap : item.polygon_count !== wanted.triangles) problems.push(`${item.polygon_count} triangles`);
  if (wanted.decimated && !item.warnings.some((warning) => warning.startsWith("Metal was simplified from 430"))) problems.push("no decimation warning");
  return problems;
}

/** What the studio reads of the design's scene: its SKU, each slot's role, its GLB and thumbnail. */
async function sceneProblems(design, scene, uploads) {
  const roles = Object.fromEntries((scene.model_config.slots ?? []).map((slot) => [slot.slotId, slot.role]));
  const glb = await readFile(path.join(uploads, scene.model_key));
  const extensions = glbExtensions(glb);
  const thumbnail = scene.thumbnail_key ? webpSize(await readFile(path.join(uploads, scene.thumbnail_key))) : null;
  const problems = [];
  if (JSON.stringify(roles) !== JSON.stringify(design.expect.roles)) problems.push(`roles ${JSON.stringify(roles)}`);
  if (scene.sku !== design.sku) problems.push(`SKU ${scene.sku}`);
  if (!extensions.includes("EXT_meshopt_compression") || !extensions.includes("KHR_draco_mesh_compression")) problems.push(`GLB extensions ${extensions}`);
  if (thumbnail?.width !== 512 || thumbnail?.height !== 512) problems.push(`thumbnail ${JSON.stringify(thumbnail)}`);
  return { problems, roles, glb, extensions };
}

/** A design that became a scene, checked as the batch page and the studio read it; its GLB. */
async function checkScene(call, uploads, design, item) {
  if (item.status !== "done" || !item.scene_id) throw new Error(`${design.sku}: ${item.status} ${item.error_code ?? ""} ${item.error ?? ""}`);
  const scene = await call("GET", `/scenes/${item.scene_id}`);
  const { problems, roles, glb, extensions } = await sceneProblems(design, scene, uploads);
  problems.push(...reportProblems(design, item));
  if (problems.length) throw new Error(`${design.sku}: ${problems.join("; ")}`);
  log(`${design.sku}: scene ${scene.id}, ${item.polygon_count} triangles, ${item.size_mm} mm, roles ${JSON.stringify(roles)}, GLB ${glb.length} bytes (${extensions.join(", ")}), thumbnail 512x512; warnings: ${item.warnings.join(" | ") || "none"}`);
  return glb;
}

function checkFailed(design, item) {
  if (item.status !== "failed" || item.error_code !== design.expect.failed || item.model_credit_held !== 0) {
    throw new Error(`${design.sku}: expected to fail with ${design.expect.failed}, refunded; it is ${item.status} (${item.error_code}), holding ${item.model_credit_held}`);
  }
  log(`${design.sku}: failed with ${item.error_code}, its model credit given back: ${item.error}`);
}

/** No page reached a CDN: nothing blocked, nothing cached from one, every converter file vendored. */
async function checkWorkerLog(logFile) {
  const lines = (await readFile(logFile, "utf8")).split("\n");
  const offending = lines.filter((line) => / blocked | cached |asset .* failed/.test(line));
  if (!lines.some((line) => line.includes("converters: 6 of 6 files vendored"))) throw new Error("the worker did not load every vendored converter file");
  if (offending.length) throw new Error(`the worker's pages reached past their sink and vendored files:\n${offending.join("\n")}`);
  log("no page reached past the harness, its sink and the vendored converter files: nothing blocked, nothing fetched");
}

/**
 * The GLB the upload page stores for `files`: the page itself, in the worker's browser and under
 * the worker's network policy, its sign-in and storage calls answered here. Save presigns and PUTs
 * the GLB, then the thumbnail; the GLB's PUT is what it would store.
 */
async function uploadPageGlb({ harnessUrl, files, assets }) {
  const browser = await launchBrowser(PROFILE);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await guardContext(context, { policy: pagePolicy({ harnessOrigin: harnessUrl, assetPrefixes: [], vendoredUrls: assets.vendored }), assets });
    let puts = 0;
    let stored;
    const glb = new Promise((resolve) => {
      stored = resolve;
    });
    const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    // Routes added after the guard's run first.
    await context.route(`${harnessUrl}/api/auth/me`, (route) => json(route, { id: 1, email: "upload@devjewels.test" }));
    await context.route(`${harnessUrl}/api/upload/presign`, (route) => {
      puts += 1;
      return json(route, { upload_url: `https://storage.smoke.test/${puts}`, key: `customers/1/models/smoke-${puts}.glb`, method: "PUT" });
    });
    await context.route("https://storage.smoke.test/**", (route) => {
      if (route.request().headers()["content-type"] === "model/gltf-binary") stored(route.request().postDataBuffer());
      return route.fulfill({ status: 200, body: "" });
    });
    await context.route(`${harnessUrl}/api/upload/register`, (route) => json(route, { scene_id: 1, model_key: "customers/1/models/smoke-1.glb" }));
    await context.route(`${harnessUrl}/viewer/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>saved</p>" }));
    const page = await context.newPage();
    page.setDefaultTimeout(CONVERT_TIMEOUT_MS);
    await page.goto(`${harnessUrl}/upload-model`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="file"][accept]').setInputFiles(files);
    await page.getByRole("button", { name: /Save and open studio/ }).click();
    return await glb;
  } finally {
    await browser.close();
  }
}

/**
 * A GLB with the random ids three.js gives every material it makes set aside: a 3DM's root carries
 * the Rhino loader's materials in its extras, so two loads of one file differ in those alone.
 */
function withoutRandomIds(glb) {
  const length = glb.readUInt32LE(12);
  const json = glb.toString("utf8", 20, 20 + length).replace(/"uuid":"[0-9a-f-]{36}"/g, '"uuid":""');
  return Buffer.concat([glb.subarray(0, 20), Buffer.from(json), glb.subarray(20 + length)]);
}

/** The upload page saves each design's files as the same GLB the worker converted them to. */
async function checkUploadPageParity({ harnessUrl, assets, workDir, scenes }) {
  for (const sku of SAVED_BY_THE_UPLOAD_PAGE) {
    const design = DESIGNS.find((candidate) => candidate.sku === sku);
    // Named as they were dropped: an OBJ finds its MTL by name, and the GLB is named for its source.
    const dir = path.join(workDir, `upload-${sku}`);
    await mkdir(dir);
    const files = Object.entries(design.files).map(([name, file]) => {
      copyFileSync(fixture(file), path.join(dir, name));
      return path.join(dir, name);
    });
    const saved = await uploadPageGlb({ harnessUrl, files, assets });
    const converted = scenes.get(sku);
    if (!withoutRandomIds(saved).equals(withoutRandomIds(converted))) {
      writeFileSync(path.join(dir, "upload-page.glb"), saved);
      writeFileSync(path.join(dir, "worker.glb"), converted);
      throw new Error(`${sku}: the upload page stores another GLB than the worker converted (${saved.length} and ${converted.length} bytes, both in ${dir})`);
    }
    const same = saved.equals(converted) ? "byte for byte" : "byte for byte but for three.js's random material ids in its extras";
    log(`${sku}: the upload page stores the very GLB the worker converted (${saved.length} bytes, ${same})`);
  }
}

async function main() {
  const startedAt = Date.now();
  const workDir = await mkdtemp(path.join(os.tmpdir(), "convert-smoke-"));
  const uploads = path.join(workDir, "uploads");
  await mkdir(uploads);
  const vendorDir = path.resolve(process.env.WORKER_VENDOR_DIR || path.join(os.tmpdir(), "render-worker-vendor"));
  let ok = false;
  try {
    const fetched = await vendorFiles(vendorDir, { log });
    log(`the converters' files are in ${vendorDir}, each its pinned hash (${fetched} fetched now)`);
    const workerToken = randomBytes(24).toString("hex");
    const python = smokePython();
    const env = backendEnv({ workDir, workerToken });
    const { url: apiUrl, seed } = await startBackend({ workDir, port: await freePort(8790), python, env, seed: ["scripts.seed_convert_smoke", "seed"] });
    log(`API on ${apiUrl} (SQLite, local storage)`);
    const harnessUrl = await startWorkerApp({ workDir, port: await freePort(3900), apiUrl });
    log(`worker app on ${harnessUrl}`);
    const call = api(apiUrl, seed.token);

    const batch = await call("POST", "/ingest/batches", batchRequest());
    log(`batch ${batch.id}: ${batch.items.length} designs, ${batch.quote.model_credits} model credits quoted`);
    await run(python, ["-m", "scripts.seed_convert_smoke", "put", String(batch.id), JSON.stringify(storedFiles())], { cwd: BACKEND, env, logDir: workDir });
    const itemIds = batch.items.map((item) => item.id);
    const confirmed = await call("POST", `/ingest/batches/${batch.id}/uploaded`, { item_ids: itemIds });
    if (confirmed.missing.length) throw new Error(`uploads not confirmed: ${JSON.stringify(confirmed.missing)}`);
    await call("POST", `/ingest/batches/${batch.id}/submit`);
    const queued = (await call("GET", `/ingest/batches/${batch.id}/items?limit=100`)).items;
    for (const design of DESIGNS.filter((candidate) => candidate.cap)) {
      const item = queued.find((candidate) => candidate.sku === design.sku);
      await run(python, ["-m", "scripts.seed_convert_smoke", "cap", String(item.convert_job_id), String(design.cap)], { cwd: BACKEND, env, logDir: workDir });
      log(`${design.sku}: its job ${item.convert_job_id} capped at ${design.cap} triangles`);
    }

    const worker = startWorker("worker-convert", { workDir, apiUrl, harnessUrl, workerToken, env: { WORKER_KINDS: "convert", WORKER_VENDOR_DIR: vendorDir } });
    const items = await waitForDesigns(call, batch.id);
    signal(worker, "SIGTERM");
    if ((await worker.exited) !== 0) throw new Error("the worker did not stop cleanly on SIGTERM");

    const scenes = new Map();
    for (const design of DESIGNS) {
      const item = items.find((candidate) => candidate.sku === design.sku);
      if (design.expect.failed) checkFailed(design, item);
      else scenes.set(design.sku, await checkScene(call, uploads, design, item));
    }
    const settled = await call("GET", `/ingest/batches/${batch.id}`);
    if (settled.status !== "completed_with_errors") throw new Error(`the batch is ${settled.status}`);
    log(`batch ${batch.id}: ${settled.status}, ${JSON.stringify(settled.counts)}`);
    await checkWorkerLog(worker.logFile);

    const assets = createAssetCache({ dir: path.join(workDir, "asset-cache"), vendor: await loadVendor(vendorDir) });
    await checkUploadPageParity({ harnessUrl, assets, workDir, scenes });
    ok = true;
    log(`PASS in ${Math.round((Date.now() - startedAt) / 1000)} s`);
  } finally {
    await stopAll();
    if (!ok) {
      printLogs();
      log(`kept ${workDir}`);
    } else if (process.env.WORKER_SMOKE_KEEP) {
      log(`kept ${workDir}`);
    } else {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

stopOnInterrupt(log);

main().catch((error) => {
  console.error(`[smoke-convert] FAIL: ${error.message}`);
  process.exitCode = 1;
});
