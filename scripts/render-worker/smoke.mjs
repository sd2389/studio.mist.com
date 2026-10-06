#!/usr/bin/env node
/*
 * `npm run worker:smoke`: a still, a turntable and a spin from create to download, on this
 * machine (ADR 0005, A4 and B3).
 *
 * Starts an API on a free port from 8790 (a throwaway SQLite database, local storage), the worker
 * build of the app from 3900 (`next start`; set HARNESS_BASE_URL to use one already running) and
 * the render worker on the swiftshader profile (WORKER_GPU=metal for a Mac's GPU). A Free user
 * creates the three jobs; the worker claims, renders, encodes, uploads and completes each; the
 * user downloads them. Then it checks that the still is what the browser pipeline renders from
 * the same job, the Free mark included; that the MP4 is H.264 High, yuv420p and BT.709 with every
 * frame, plays in Chrome and starts on that still; that the spin's ZIP opens and its spin.html
 * turns; and that a page under the worker's network policy can't reach a host off its allowlist.
 * `--kill` runs the still alone and kills the worker mid-job instead, and checks a second one
 * finishes the job once its lease has lapsed. Everything it starts, it stops.
 *
 * Needs a worker build in NEXT_BUILD_DIR (default .next), `BUILD_TARGET=worker npm run build`,
 * Playwright's Chromium, ffmpeg with libx264 and ffprobe, and the backend's virtualenv
 * (backend/.venv, or WORKER_SMOKE_PYTHON).
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ssim } from "ssim.js";
import { createAssetCache } from "./assets.mjs";
import { launchBrowser, PAGE_VIEWPORT } from "./browser.mjs";
import { guardContext, pagePolicy } from "./network.mjs";
import { startSink } from "./sink.mjs";
import { checkSpin, checkTurntable, decodePng } from "./smoke-outputs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BACKEND = path.join(ROOT, "backend");
const DEMO_RING = path.join(BACKEND, "scripts/fixtures/demo-embed-ring.glb");
/** The swiftshader profile runs anywhere; WORKER_GPU=metal tries the Mac's GPU instead. */
const PROFILE = process.env.WORKER_GPU || "swiftshader";
const JOB_TIMEOUT_MS = 10 * 60_000;
const KILL_LEASE_SECONDS = 60;
/** The still the smoke user asks for: a Campaign Pack angle, framed on the ring. */
const STILL = { kind: "still", name: "smoke-still", spec: { camera: { angle: "three-quarter" }, width: 640, height: 480, format: "png" } };
/** A second of turntable from the still's camera, so its frame 0 is that still; and a small spin. */
const TURNTABLE = {
  kind: "turntable",
  name: "smoke-turntable",
  spec: { width: 640, height: 480, fps: 24, frames: 24, quality: "high", path: { orbit: { start: { angle: "three-quarter" } } } },
};
const SPIN = { kind: "spin", name: "smoke", spec: { frames: 12, size: 256, format: "jpeg" } };

const killScenario = process.argv.includes("--kill");
const started = [];
const log = (message) => console.log(`[smoke] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The first port from `from` up that nothing listens on. */
async function freePort(from) {
  for (let port = from; port < from + 100; port += 1) {
    const free = await new Promise((resolve) => {
      const server = net.createServer().once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port from ${from}`);
}

/** Starts a process whose output goes to `<work>/<name>.log`; `stopAll` stops it. */
function start(name, command, args, { cwd = ROOT, env, logDir }) {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const out = createWriteStream(path.join(logDir, `${name}.log`));
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve(code ?? signal)));
  const entry = { name, child, exited, logFile: path.join(logDir, `${name}.log`) };
  started.push(entry);
  return entry;
}

/** Signals a process and everything it started (its process group). */
function signal(entry, name) {
  try {
    process.kill(-entry.child.pid, name);
  } catch {
    // Gone already.
  }
}

async function stopAll() {
  await Promise.all(
    started.map(async (entry) => {
      if (entry.child.exitCode !== null || entry.child.signalCode !== null) return;
      signal(entry, "SIGTERM");
      const timer = setTimeout(() => signal(entry, "SIGKILL"), 10_000);
      await entry.exited;
      clearTimeout(timer);
    }),
  );
}

async function run(command, args, options) {
  const entry = start(`${path.basename(command)}-${started.length}`, command, args, options);
  const code = await entry.exited;
  const output = await readFile(entry.logFile, "utf8");
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} exited ${code}:\n${output}`);
  return output;
}

async function waitForHttp(url, entry, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (entry.child.exitCode !== null) throw new Error(`${entry.name} exited ${entry.child.exitCode}`);
    const ok = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((response) => response.ok, () => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error(`${url} never answered`);
}

function api(baseUrl, token) {
  return async (method, route, body) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${await response.text()}`);
    return response.headers.get("content-type")?.includes("json") ? response.json() : Buffer.from(await response.arrayBuffer());
  };
}

/** Polls the job until it ends; `onChange` hears every status (and error code) it passes through. */
async function waitForJob(call, id, onChange = () => {}) {
  const until = Date.now() + JOB_TIMEOUT_MS;
  let last = "";
  while (Date.now() < until) {
    const job = await call("GET", `/render-jobs/${id}`);
    const seen = `${job.status}${job.error_code ? ` (${job.error_code})` : ""}`;
    if (seen !== last) onChange(job, seen);
    last = seen;
    if (["completed", "failed", "canceled"].includes(job.status)) return job;
    await sleep(500);
  }
  throw new Error(`job ${id} did not end within ${JOB_TIMEOUT_MS / 60_000} min`);
}

/** Share of pixels that differ at all between two images of one size. */
function changedShare(a, b) {
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    if (a.data[index] !== b.data[index] || a.data[index + 1] !== b.data[index + 1] || a.data[index + 2] !== b.data[index + 2]) changed += 1;
  }
  return changed / (a.width * a.height);
}

/**
 * The job rendered by the browser pipeline itself, with no worker in between: the harness's export
 * mode on the same profile, the payload built from the job as the API keeps it (the scene's look
 * names no catalogue items), and the image the page hands its sink.
 */
async function renderReference({ harnessUrl, job, watermark, workDir, assets }) {
  const payload = {
    kind: job.kind,
    spec: job.spec,
    look: job.look,
    look_items: { environments: [], backgrounds: [], grounds: [], metals: [], gems: [], user_materials: [] },
    model: { path: `/render-jobs/${job.id}/inputs/model` },
    watermark,
    limits: { max_edge: Math.max(job.spec.width, job.spec.height), max_runtime_seconds: 300 },
    scene: { id: job.scene_id, name: null, sku: null },
  };
  const outDir = await mkdtemp(path.join(workDir, "reference-"));
  const sink = await startSink({ origin: harnessUrl, model: DEMO_RING, outDir, names: job.spec.output_names });
  const browser = await launchBrowser(PROFILE);
  try {
    const context = await browser.newContext({ viewport: PAGE_VIEWPORT, deviceScaleFactor: 1, serviceWorkers: "block" });
    await guardContext(context, { policy: pagePolicy({ harnessOrigin: harnessUrl, sinkOrigin: sink.url }), assets });
    await context.addInitScript((handOff) => {
      window.__RENDER_JOB__ = handOff;
    }, { payload, sink: { url: sink.url, token: sink.token } });
    const page = await context.newPage();
    page.setDefaultTimeout(JOB_TIMEOUT_MS);
    await page.goto(`${harnessUrl}/render-harness?mode=export`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__HARNESS_STATE__ === "done" || String(window.__HARNESS_STATE__).startsWith("error"));
    const state = await page.evaluate(() => String(window.__HARNESS_STATE__));
    if (state !== "done") throw new Error(`reference render: ${state}`);
    return readFile(sink.files.get(job.spec.output_names[0]).path);
  } finally {
    await browser.close();
    await sink.close();
  }
}

/** A page under the worker's policy reaches its harness, and nothing off its allowlist. */
async function checkAllowlist({ harnessUrl, apiUrl, assets }) {
  const browser = await launchBrowser(PROFILE);
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await guardContext(context, { policy: pagePolicy({ harnessOrigin: harnessUrl }), assets });
    const page = await context.newPage();
    await page.goto(`${harnessUrl}/render-harness?mode=probe`, { waitUntil: "domcontentloaded" });
    const reach = (url) => page.evaluate((target) => fetch(target, { cache: "no-store" }).then((r) => `answered ${r.status}`, () => "aborted"), url);
    const results = {
      harness: await reach(`${harnessUrl}/render-harness?mode=probe`),
      "an outside host": await reach("https://example.com/"),
      "the API, on loopback": await reach(`${apiUrl}/health`),
      "the cloud metadata address": await reach("http://169.254.169.254/latest/meta-data/"),
    };
    const wrong = Object.entries(results).filter(([what, result]) => (what === "harness" ? !result.startsWith("answered 200") : result !== "aborted"));
    if (wrong.length) throw new Error(`allowlist: ${JSON.stringify(results)}`);
    return results;
  } finally {
    await browser.close();
  }
}

async function startBackend({ workDir, port, workerToken, python }) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    APP_ENV: "development",
    DATABASE_URL: `sqlite:///${path.join(workDir, "smoke.db")}`,
    STORAGE_BACKEND: "local",
    UPLOAD_DIR: path.join(workDir, "uploads"),
    RENDER_WORKER_TOKEN: workerToken,
    RENDER_JOB_LEASE_SECONDS: String(killScenario ? KILL_LEASE_SECONDS : 120),
    AI_BACKGROUND_MODE: "stub",
  };
  const seedOutput = await run(python, ["-m", "scripts.seed_worker_smoke"], { cwd: BACKEND, env, logDir: workDir });
  const seed = JSON.parse(seedOutput.trim().split("\n").at(-1));
  const backend = start("backend", python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], { cwd: BACKEND, env, logDir: workDir });
  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(`${url}/health`, backend);
  return { url, seed };
}

async function startWorkerApp({ workDir, port, apiUrl }) {
  if (process.env.HARNESS_BASE_URL) return process.env.HARNESS_BASE_URL.replace(/\/+$/, "");
  const distDir = process.env.NEXT_BUILD_DIR || ".next";
  if (!existsSync(path.join(ROOT, distDir, "server/app/render-harness/page.js"))) {
    throw new Error(`no worker build in ${distDir}: run \`BUILD_TARGET=worker npm run build\` first (or set HARNESS_BASE_URL)`);
  }
  const env = { ...process.env, BUILD_TARGET: "worker", NEXT_TELEMETRY_DISABLED: "1", API_URL: apiUrl };
  const app = start("worker-app", process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { env, logDir: workDir });
  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(`${url}/render-harness?mode=probe`, app);
  return url;
}

function startWorker(name, { workDir, apiUrl, harnessUrl, workerToken }) {
  const env = {
    ...process.env,
    RENDER_API_URL: apiUrl,
    RENDER_WORKER_TOKEN: workerToken,
    HARNESS_BASE_URL: harnessUrl,
    WORKER_GPU: PROFILE,
    WORKER_ID: name,
    WORKER_POLL_SECONDS: "1",
    WORKER_CACHE_DIR: path.join(workDir, "asset-cache"),
    WORKER_TMP_DIR: workDir,
  };
  return start(name, process.execPath, [path.join(ROOT, "scripts/render-worker/worker.mjs")], { env, logDir: workDir });
}

/** Kills the first worker as soon as it renders the job; a second one must finish it after the lease. */
async function killMidJob({ call, job, workers }) {
  const first = workers.start("smoke-a");
  let second = null;
  const seen = [];
  const finished = await waitForJob(call, job.id, (state, label) => {
    seen.push(label);
    log(`job ${job.id}: ${label}`);
    if (state.status === "running" && !second) {
      signal(first, "SIGKILL");
      log(`killed worker smoke-a (and its browser) mid-job; smoke-b gets the job once its ${KILL_LEASE_SECONDS} s lease lapses`);
      second = workers.start("smoke-b");
    }
  });
  if (finished.status !== "completed" || finished.attempts !== 2 || !seen.some((label) => label.includes("lease_expired"))) {
    throw new Error(`kill: expected a second attempt to complete after the lease lapsed; saw ${seen.join(" → ")}`);
  }
  return { finished: [finished], seen, second };
}

/** One worker renders the jobs, which it claims in the order they were made. */
async function renderAll({ call, jobs, workers }) {
  const worker = workers.start("smoke");
  const finished = [];
  for (const job of jobs) finished.push(await waitForJob(call, job.id, (_state, label) => log(`job ${job.id} (${job.kind}): ${label}`)));
  return { finished, worker };
}

/** A job's one output, downloaded, once the job has completed with it as the API planned it. */
async function downloadOutput(call, job, contentType, [width, height]) {
  if (job.status !== "completed") throw new Error(`job ${job.id} (${job.kind}) ${job.status}: ${job.error_code} ${job.error}`);
  const [output] = job.outputs;
  const planned = { filename: job.spec.output_names[0], content_type: contentType, width, height };
  const wrong = Object.entries(planned).filter(([key, value]) => output[key] !== value);
  if (job.outputs.length !== 1 || wrong.length) throw new Error(`job ${job.id}'s output: ${JSON.stringify(job.outputs)}`);
  const file = await call("GET", output.download_url);
  if (file.length !== output.bytes) throw new Error(`downloaded ${file.length} bytes of ${output.filename}; the job says ${output.bytes}`);
  return { output, file };
}

/** The turntable's MP4 and the spin's ZIP, downloaded and checked; `still` is the decoded still of the turntable's start camera. */
async function checkVideoJobs({ call, turntable, spin, still, workDir }) {
  const { output: mp4, file: clip } = await downloadOutput(call, turntable, "video/mp4", [turntable.spec.width, turntable.spec.height]);
  const video = await checkTurntable({ mp4: clip, spec: turntable.spec, still, profile: PROFILE, workDir });
  const { stream } = video;
  log(`downloaded ${mp4.filename}: ${mp4.bytes} bytes, ${stream.codec_name} ${stream.profile} ${stream.pix_fmt} ${stream.color_space}/${stream.color_range}, ${stream.nb_read_frames} frames at ${stream.r_frame_rate}, boxes ${video.boxes.join(" ")}`);
  const colour = video.colourDifference.map((value) => value.toFixed(2)).join("/");
  log(`Chrome played it to the end (${video.duration} s); its frame 0 against the still: SSIM ${video.similarity.toFixed(4)}, mean RGB difference ${colour}`);
  const { output: zip, file: archive } = await downloadOutput(call, spin, "application/zip", [spin.spec.size, spin.spec.size]);
  const spun = await checkSpin({ zip: archive, spec: spin.spec, profile: PROFILE });
  log(`downloaded ${zip.filename}: ${zip.bytes} bytes, ${spun.entries} entries; its spin.html loaded every frame and turns`);
}

async function main() {
  const startedAt = Date.now();
  const workDir = await mkdtemp(path.join(os.tmpdir(), "worker-smoke-"));
  await mkdir(path.join(workDir, "uploads"));
  const python = process.env.WORKER_SMOKE_PYTHON || (existsSync(path.join(BACKEND, ".venv/bin/python")) ? path.join(BACKEND, ".venv/bin/python") : "python3");
  let ok = false;
  try {
    const workerToken = randomBytes(24).toString("hex");
    const { url: apiUrl, seed } = await startBackend({ workDir, port: await freePort(8790), workerToken, python });
    log(`API on ${apiUrl} (SQLite, local storage)`);
    const harnessUrl = await startWorkerApp({ workDir, port: await freePort(3900), apiUrl });
    log(`worker app on ${harnessUrl}`);
    const call = api(apiUrl, seed.token);
    const workers = { start: (name) => startWorker(name, { workDir, apiUrl, harnessUrl, workerToken }) };

    const jobs = [];
    for (const request of killScenario ? [STILL] : [STILL, TURNTABLE, SPIN]) {
      const created = await call("POST", "/render-jobs", { ...request, scene_id: seed.scene_id });
      log(`created job ${created.id}: ${created.kind} ${created.spec.output_names.join(", ")}, ${created.credits} credit(s) held, watermark ${created.watermark}`);
      jobs.push(created);
    }
    const [job] = jobs;
    const rendered = killScenario ? await killMidJob({ call, job, workers }) : await renderAll({ call, jobs, workers });
    const { worker, second } = rendered;
    const [finished, turntable, spin] = rendered.finished;
    if (finished.status !== "completed") throw new Error(`job ${job.id} ${finished.status}: ${finished.error_code} ${finished.error}`);
    const running = worker ?? second;
    signal(running, "SIGTERM");
    const exitCode = await running.exited;
    if (exitCode !== 0) throw new Error(`the worker exited ${exitCode} on SIGTERM`);

    const [output] = finished.outputs;
    const file = await call("GET", output.download_url);
    const image = decodePng(file);
    if (file.length !== output.bytes || image.width !== job.spec.width || image.height !== job.spec.height) {
      throw new Error(`download: ${file.length} bytes, ${image.width}x${image.height}; the job says ${output.bytes} bytes, ${job.spec.width}x${job.spec.height}`);
    }
    log(`downloaded ${output.filename}: ${output.bytes} bytes, ${image.width}x${image.height}; credits ${finished.credit_state}, attempts ${finished.attempts}`);

    const assets = createAssetCache({ dir: path.join(workDir, "asset-cache") });
    const marked = decodePng(await renderReference({ harnessUrl, job: finished, watermark: true, workDir, assets }));
    const unmarked = decodePng(await renderReference({ harnessUrl, job: finished, watermark: false, workDir, assets }));
    const sameAsMarked = ssim(image, marked).mssim;
    const markShare = changedShare(image, unmarked);
    log(`the worker's file against the browser pipeline's: SSIM ${sameAsMarked.toFixed(4)} with the Free mark, ${(markShare * 100).toFixed(1)}% of pixels differ from it without`);
    if (sameAsMarked < 0.99 || markShare < 0.005) throw new Error("the worker's still is not the browser pipeline's, mark included");
    if (!killScenario) await checkVideoJobs({ call, turntable, spin, still: image, workDir });

    const allowlist = await checkAllowlist({ harnessUrl, apiUrl, assets });
    log(`allowlist: ${Object.entries(allowlist).map(([what, result]) => `${what} ${result}`).join(", ")}`);
    ok = true;
    log(`PASS in ${Math.round((Date.now() - startedAt) / 1000)} s`);
  } finally {
    await stopAll();
    if (!ok) {
      for (const entry of started) {
        const text = readFileSync(entry.logFile, "utf8").trim().split("\n").slice(-25).join("\n");
        console.log(`--- ${entry.name} (last lines of ${entry.logFile})\n${text}`);
      }
      log(`kept ${workDir}`);
    } else if (process.env.WORKER_SMOKE_KEEP) {
      log(`kept ${workDir}`);
    } else {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

// The processes run in their own groups, so a Ctrl-C reaches only this one: stop them first.
process.once("SIGINT", () => {
  log("interrupted; stopping what it started");
  stopAll().then(() => process.exit(130));
});

main().catch((error) => {
  console.error(`[smoke] FAIL: ${error.message}`);
  process.exitCode = 1;
});
