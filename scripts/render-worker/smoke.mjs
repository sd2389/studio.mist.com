#!/usr/bin/env node
/*
 * `npm run worker:smoke`: a still, a turntable, a spin and a small Campaign Pack from create to
 * download, on this machine (ADR 0005, A4, B3 and D2).
 *
 * Starts an API on a free port from 8790 (a throwaway SQLite database, local storage), the worker
 * build of the app from 3900 (`next start`; set HARNESS_BASE_URL to use one already running) and
 * the render worker on the swiftshader profile (WORKER_GPU=metal for a Mac's GPU). A Free user
 * creates the first three jobs and a Grow user the pack; the worker claims, renders, encodes,
 * uploads and completes each; the users download them. Then it checks that the still is what the
 * browser pipeline renders from the same job, the Free mark included; that the MP4 is H.264 High,
 * yuv420p and BT.709 with every frame, plays in Chrome and starts on that still; that the spin's
 * ZIP opens and its spin.html turns; that the pack's ZIP holds what the studio's planner names, in
 * its order, its turntables as MP4s like the turntable's, its manifest every file, a spin.html
 * that turns, and a re-skinned metal lit as the piece is (its reflections); and that a page under
 * the worker's network policy can't reach a host off its allowlist. `--kill` runs the still alone
 * and kills the worker mid-job instead, and checks a second one finishes the job once its lease
 * has lapsed. Everything it starts, it stops.
 *
 * Needs a worker build in NEXT_BUILD_DIR (default .next), `BUILD_TARGET=worker npm run build`,
 * Playwright's Chromium, ffmpeg with libx264 and ffprobe, and the backend's virtualenv
 * (backend/.venv, or WORKER_SMOKE_PYTHON).
 */
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ssim } from "ssim.js";
import { createAssetCache } from "./assets.mjs";
import { launchBrowser, PAGE_VIEWPORT } from "./browser.mjs";
import { guardContext, pagePolicy } from "./network.mjs";
import { startSink } from "./sink.mjs";
import { checkPack, checkSpin, checkTurntable, decodePng } from "./smoke-outputs.mjs";
import {
  api,
  BACKEND,
  backendEnv,
  freePort,
  printLogs,
  PROFILE,
  signal,
  smokePython,
  startBackend,
  startWorker,
  startWorkerApp,
  stopAll,
  stopOnInterrupt,
  waitForJob,
} from "./smoke-stack.mjs";

const DEMO_RING = path.join(BACKEND, "scripts/fixtures/demo-embed-ring.glb");
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
/**
 * The Grow user's pack, as the studio's dialog asks for one: the ring as configured and re-skinned
 * in 18K yellow gold, from the front as a JPG and a cutout, a 12-frame spin and a one-second square
 * turntable each. The ring has no SKU, so no embed; its stones aren't traced, so no ASET image.
 */
const PACK = {
  kind: "campaign_pack",
  // As the dialog names it: the pack's root folder.
  name: "Smoke-ring",
  spec: {
    metals: ["current", "gold-18k-yellow"], angleIds: ["front"], stillSize: 1000, formats: { jpg: true, png: true },
    background: { kind: "white" }, jpegQuality: 0.9, autoFrame: true, marginPct: 8, contactShadow: true,
    turntable: { enabled: true, formats: ["square"], durationSec: 1, fps: 12 },
    spin: { enabled: true, frames: 12, size: 256 }, embed: false, cutScope: false,
  },
};
/** Its turntables. */
const PACK_VIDEO = { width: 1080, height: 1080, fps: 12, frames: 12 };
/** Its ZIP's entries, in order, as planCampaignPack names them for the smoke's ring ("Smoke ring", no SKU). */
const PACK_ENTRIES = (() => {
  const metal = (slug) => [
    `Smoke-ring/stills/${slug}_front.jpg`,
    `Smoke-ring/stills/${slug}_front.png`,
    ...Array.from({ length: 12 }, (_, index) => `Smoke-ring/spin/${slug}/${slug}_${String(index + 1).padStart(3, "0")}.jpg`),
    `Smoke-ring/video/${slug}_turntable_1080x1080.mp4`,
  ];
  return [...metal("as-configured"), ...metal("18k-yellow-gold"), "Smoke-ring/spin/spin.html", "Smoke-ring/README.md", "Smoke-ring/manifest.json"];
})();
/**
 * The pack's re-skinned 18K gold against the studio's own 18K gold from the same camera, as a mean
 * difference of each colour channel on the piece (0 to 255). On a Mac's GPU they differ by 0.65;
 * with the stage left still while the metal environment probe waits, the re-skin falls back to the
 * scene's plain environment, without the studio's metal light, and they differ by 22.
 */
const RESKIN_MAX_DIFFERENCE = 3;
/** The pack's front still of the re-skinned gold: a cutout, framed as the pack frames its stills. */
const RESKINNED_FRONT = "Smoke-ring/stills/18k-yellow-gold_front.png";

const killScenario = process.argv.includes("--kill");
const log = (message) => console.log(`[smoke] ${message}`);

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

/** One worker renders the jobs, which it claims in the order they were made; each is followed as its owner (`callFor`). */
async function renderAll({ callFor, jobs, workers }) {
  const worker = workers.start("smoke");
  const finished = [];
  for (const job of jobs) finished.push(await waitForJob(callFor(job), job.id, (_state, label) => log(`job ${job.id} (${job.kind}): ${label}`)));
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

/**
 * The studio's own 18K gold on the pack's ring: the harness's still of the pack's look with its
 * metal slot in 18K yellow gold, a cutout from the pack's front camera at the pack's still size.
 */
async function renderStudioGold({ harnessUrl, pack, workDir, assets }) {
  const look = { ...pack.look, material: "gold-18k-yellow", slot_selections: { ...pack.look.slot_selections, "Metal 1": "gold-18k-yellow" } };
  const spec = {
    camera: { angle: "front", margin_pct: pack.spec.marginPct },
    width: pack.spec.stillSize,
    height: pack.spec.stillSize,
    format: "png",
    jpeg_quality: 0.95,
    transparent: true,
    output_names: ["studio-gold-front.png"],
  };
  return decodePng(await renderReference({ harnessUrl, job: { id: pack.id, scene_id: pack.scene_id, kind: "still", look, spec }, watermark: false, workDir, assets }));
}

/** The pack's ZIP, downloaded as its owner, and checked: its entries, MP4s, manifest, spin.html and a re-skinned metal's light. */
async function checkPackJob({ call, pack, harnessUrl, workDir, assets }) {
  const { output, file } = await downloadOutput(call, pack, "application/zip", [null, null]);
  const reskinned = { entry: RESKINNED_FRONT, studio: await renderStudioGold({ harnessUrl, pack, workDir, assets }) };
  const checked = await checkPack({ zip: file, expected: PACK_ENTRIES, video: PACK_VIDEO, reskinned, profile: PROFILE, workDir });
  log(`downloaded ${output.filename}: ${output.bytes} bytes, ${pack.credits} credits ${pack.credit_state}; its ${checked.entries} entries are the planner's, in its order; its ${checked.videos} MP4s are H.264 High, BT.709, every frame; its manifest lists every file; its spin.html turns`);
  const { similarity, difference } = checked.reskin;
  log(`its re-skinned 18K gold against the studio's own from the same camera: SSIM ${similarity.toFixed(4)}, ${difference.toFixed(2)} apart on the piece (at most ${RESKIN_MAX_DIFFERENCE})`);
  if (difference > RESKIN_MAX_DIFFERENCE) throw new Error("the pack's re-skinned metal isn't lit as the studio lights it: it has lost the studio's metal environment");
}

async function main() {
  const startedAt = Date.now();
  const workDir = await mkdtemp(path.join(os.tmpdir(), "worker-smoke-"));
  await mkdir(path.join(workDir, "uploads"));
  let ok = false;
  try {
    const workerToken = randomBytes(24).toString("hex");
    const env = backendEnv({ workDir, workerToken, leaseSeconds: killScenario ? KILL_LEASE_SECONDS : 120 });
    const { url: apiUrl, seed } = await startBackend({ workDir, port: await freePort(8790), python: smokePython(), env, seed: ["scripts.seed_worker_smoke"] });
    log(`API on ${apiUrl} (SQLite, local storage)`);
    const harnessUrl = await startWorkerApp({ workDir, port: await freePort(3900), apiUrl });
    log(`worker app on ${harnessUrl}`);
    const call = api(apiUrl, seed.token);
    const growCall = api(apiUrl, seed.grow.token);
    const workers = { start: (name) => startWorker(name, { workDir, apiUrl, harnessUrl, workerToken }) };

    const jobs = [];
    const requests = killScenario
      ? [[call, STILL, seed.scene_id]]
      : [[call, STILL, seed.scene_id], [call, TURNTABLE, seed.scene_id], [call, SPIN, seed.scene_id], [growCall, PACK, seed.grow.scene_id]];
    const owners = new Map();
    for (const [owner, request, sceneId] of requests) {
      const created = await owner("POST", "/render-jobs", { ...request, scene_id: sceneId });
      log(`created job ${created.id}: ${created.kind} ${created.spec.output_names.join(", ")}, ${created.credits} credit(s) held, watermark ${created.watermark}`);
      owners.set(created.id, owner);
      jobs.push(created);
    }
    const [job] = jobs;
    const callFor = (created) => owners.get(created.id);
    const rendered = killScenario ? await killMidJob({ call, job, workers }) : await renderAll({ callFor, jobs, workers });
    const { worker, second } = rendered;
    const [finished, turntable, spin, pack] = rendered.finished;
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
    if (!killScenario) {
      await checkVideoJobs({ call, turntable, spin, still: image, workDir });
      await checkPackJob({ call: growCall, pack, harnessUrl, workDir, assets });
    }

    const allowlist = await checkAllowlist({ harnessUrl, apiUrl, assets });
    log(`allowlist: ${Object.entries(allowlist).map(([what, result]) => `${what} ${result}`).join(", ")}`);
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
  console.error(`[smoke] FAIL: ${error.message}`);
  process.exitCode = 1;
});
