import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import path from "node:path";
import { ApiError, JobLostError } from "./api.mjs";
import { PAGE_VIEWPORT, PROFILES } from "./browser.mjs";
import { guardContext, pagePolicy } from "./network.mjs";
import { startSink } from "./sink.mjs";

/*
 * One job, start to end (ADR 0005, "Process"): payload → the model into the job's folder → a
 * sink with a fresh token → the harness's export mode in a fresh browser context → heartbeats
 * all along → uploads → complete. Any failure is reported with a code, except when the API
 * has taken the job back (401, 404 or 409), which drops it.
 */

/** Codes another attempt may fix (RETRYABLE_CODES in backend/app/features/render_jobs/worker.py). */
const RETRYABLE = new Set(["browser_crashed", "gpu_lost", "upload_failed", "unknown"]);
/** Tries for one PUT, as the ADR says, asking for fresh URLs when storage refuses one. */
const PUT_ATTEMPTS = 3;
/** Upload URLs are signed for 15 minutes; ask again a minute before they lapse. */
const UPLOAD_URLS_FOR_MS = 14 * 60_000;
/** A still's run time limit (MAX_RUNTIME_SECONDS in the API), for a payload that gives none. */
const DEFAULT_RUNTIME_SECONDS = 300;
/** three.js logs this when WebGPU loses its device (a destroyed device it doesn't report). */
const DEVICE_LOST = /Device Lost/;

export class JobFailure extends Error {
  /** @param {string} code A FailureCode of backend/app/schemas/render_job.py. */
  constructor(code, message, { recycleBrowser = false } = {}) {
    super(message);
    this.name = "JobFailure";
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.recycleBrowser = recycleBrowser;
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });

/** Settles with `work`, or rejects with `failure`, whichever comes first; the other is silenced. */
function race(work, failure) {
  work.catch(() => {});
  failure.catch(() => {});
  return Promise.race([work, failure]);
}

/** Heartbeats every `seconds`, carrying the job's progress; a cancel or a lost job aborts it. */
function startHeartbeats(job, { seconds, state, controller, log }) {
  let busy = false;
  let sentAt = 0;
  const beat = async () => {
    if (busy || controller.signal.aborted) return;
    busy = true;
    sentAt = Date.now();
    try {
      const answer = await job.heartbeat({ progress: state.progress, stage: state.stage });
      if (answer?.cancel) controller.abort(new JobFailure("canceled", "The job was canceled or ran past its run time."));
    } catch (error) {
      if (error instanceof JobLostError) controller.abort(error);
      else log(`heartbeat failed: ${error.message}`);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(beat, seconds * 1000);
  return {
    /** Reports progress now, unless a heartbeat went less than a second ago. */
    soon: () => Date.now() - sentAt > 1000 && void beat(),
    stop: () => clearInterval(timer),
  };
}

/** Fails unless the file is a binary glTF 2.0 whose header gives its own size. */
async function checkGlb(file, bytes) {
  const handle = await open(file);
  const header = Buffer.alloc(12);
  try {
    await handle.read(header, 0, 12, 0);
  } finally {
    await handle.close();
  }
  if (header.toString("latin1", 0, 4) !== "glTF" || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== bytes) {
    throw new JobFailure("model_unreadable", "The model is not a binary glTF 2.0 (GLB) file.");
  }
}

async function downloadModel(job, payload, dest, signal) {
  const source = payload.model ?? {};
  if (!source.url && !source.path) throw new JobFailure("invalid_spec", "The payload names no model.");
  let bytes;
  try {
    bytes = await job.download(source, dest, { signal });
  } catch (error) {
    if (error instanceof ApiError && !(error instanceof JobLostError) && [403, 404, 410].includes(error.status)) {
      throw new JobFailure("input_missing", `The model could not be read: ${error.message}`);
    }
    throw error;
  }
  await checkGlb(dest, bytes);
}

/** The job's own inputs the page loads itself from storage: a signed background image. */
function signedInputs(payload) {
  const background = payload.look?.scene_settings?.customBackground;
  return typeof background === "string" && /^https?:\/\//i.test(background) ? [background] : [];
}

function pageFailure(message) {
  if (message.startsWith("invalid render job")) return new JobFailure("invalid_spec", message);
  if (message.includes("larger than your plan exports")) return new JobFailure("over_limit", message);
  return new JobFailure("unknown", message);
}

/** Opens the export mode and waits until the page says it is done, or fails, crashes or is stopped. */
async function renderOnPage(context, { harnessUrl, signal, log }) {
  const page = await context.newPage();
  const failure = new Promise((_, reject) => {
    page.once("crash", () => reject(new JobFailure("browser_crashed", "The page crashed.", { recycleBrowser: true })));
    page.on("console", (message) => {
      if (message.type() === "error" && DEVICE_LOST.test(message.text())) {
        reject(new JobFailure("gpu_lost", message.text().split("\n").join(" "), { recycleBrowser: true }));
      }
    });
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  page.on("pageerror", (error) => log(`page error: ${error.message}`));
  const done = (async () => {
    await page.goto(`${harnessUrl}/render-harness?mode=export`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(
      () => window.__HARNESS_STATE__ === "done" || String(window.__HARNESS_STATE__).startsWith("error:"),
      null,
      { timeout: 0, polling: 250 },
    );
    return page.evaluate(() => ({ state: String(window.__HARNESS_STATE__), result: window.__RENDER_RESULT__ ?? null }));
  })();
  const { state, result } = await race(done, failure);
  if (state !== "done") throw pageFailure(state.slice("error:".length));
  return result;
}

/** Every file the spec names, as the page reported it and the sink stored it. */
function collectOutputs(payload, result, sink) {
  const names = payload.spec.output_names;
  const reported = new Map((result?.outputs ?? []).map((output) => [output.name, output]));
  if (reported.size !== names.length || names.some((name) => !reported.has(name))) {
    throw new JobFailure("unknown", `The page made ${[...reported.keys()].join(", ") || "nothing"}; the job makes ${names.join(", ")}.`);
  }
  return names.map((name) => {
    const output = reported.get(name);
    const file = sink.files.get(name);
    if (!file) throw new JobFailure("unknown", `The page reported ${name} but the sink never got it.`);
    if (file.contentType !== output.content_type) throw new JobFailure("unknown", `${name} came as ${file.contentType}, not ${output.content_type}.`);
    return { ...output, label: output.label ?? null, path: file.path, bytes: file.bytes, sha256: file.sha256 };
  });
}

/** PUTs every output where the API says, asking for new URLs when they near expiry or storage refuses one. */
async function uploadOutputs(job, outputs, { signal, log }) {
  const ask = async () => {
    try {
      const { files } = await job.uploads(outputs.map(({ name, content_type, bytes }) => ({ name, content_type, bytes })), signal);
      return { at: Date.now(), byName: new Map(files.map((target) => [target.name, target])) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) throw new JobFailure("upload_failed", error.message);
      throw error;
    }
  };
  let targets = await ask();
  for (const output of outputs) {
    for (let attempt = 1; ; attempt += 1) {
      if (Date.now() - targets.at > UPLOAD_URLS_FOR_MS) targets = await ask();
      try {
        await job.put(targets.byName.get(output.name), output.path, signal);
        break;
      } catch (error) {
        if (error instanceof JobLostError || signal.aborted) throw signal.reason ?? error;
        if (attempt >= PUT_ATTEMPTS) throw new JobFailure("upload_failed", `${output.name}: ${error.message}`);
        log(`PUT ${output.name} failed (${error.message}); trying again`);
        // Storage refused the signature (or it lapsed): sign again.
        if (error.status === 400 || error.status === 403) targets = await ask();
        await sleep(1000 * attempt, signal);
      }
    }
  }
  return outputs.map((output) => ({ ...output, key: targets.byName.get(output.name).key }));
}

const clip = (value, length) => String(value ?? "").slice(0, length);

/** What drew the job, within the API's field limits. */
function rendererReport(renderer) {
  const adapter = renderer.adapter;
  return {
    browser: clip(renderer.browser, 512) || "unknown",
    backend: renderer.backend,
    adapter: adapter
      ? { vendor: clip(adapter.vendor, 256), architecture: clip(adapter.architecture, 256), device: clip(adapter.device, 256), description: clip(adapter.description, 256) }
      : null,
  };
}

function completeBody(outputs, renderer) {
  return {
    outputs: outputs.map(({ name, key, content_type, bytes, width, height, label, sha256 }) => ({
      name, key, content_type, bytes, width, height, label, meta: { sha256 },
    })),
    renderer: rendererReport(renderer),
  };
}

/** Completes the job; a 400 means the stored files don't match, so they are uploaded once more. */
async function completeJob(job, outputs, renderer, { signal, log }) {
  try {
    await job.complete(completeBody(outputs, renderer), signal);
  } catch (error) {
    if (!(error instanceof ApiError) || error instanceof JobLostError || error.status !== 400) throw error;
    log(`complete refused (${error.message}); uploading again`);
    const again = await uploadOutputs(job, outputs, { signal, log });
    try {
      await job.complete(completeBody(again, renderer), signal);
    } catch (retryError) {
      if (retryError instanceof ApiError && !(retryError instanceof JobLostError) && retryError.status === 400) {
        throw new JobFailure("upload_failed", retryError.message);
      }
      throw retryError;
    }
  }
}

/** Reports a failure, unless the API already took the job back. */
async function settleFailure(job, error, log) {
  if (error instanceof JobLostError) {
    log(`the API took the job back (${error.message}); dropped`);
    return { outcome: "lost", recycleBrowser: false };
  }
  const failure = error instanceof JobFailure ? error : new JobFailure("unknown", error?.message || String(error));
  log(`failed (${failure.code}): ${failure.message}`);
  try {
    await job.fail({ error: clip(failure.message, 1024) || failure.code, code: failure.code, retryable: failure.retryable });
  } catch (reportError) {
    if (!(reportError instanceof JobLostError)) log(`could not report the failure: ${reportError.message}`);
  }
  return { outcome: "failed", recycleBrowser: failure.recycleBrowser };
}

async function openJobContext(browser, { job, payload, sink, harnessUrl, assets, assetPrefixes, controller, log }) {
  const context = await browser.newContext({ viewport: PAGE_VIEWPORT, deviceScaleFactor: 1, serviceWorkers: "block", acceptDownloads: false });
  const policy = pagePolicy({ harnessOrigin: harnessUrl, sinkOrigin: sink.url, jobId: job.id, inputUrls: signedInputs(payload), assetPrefixes });
  await guardContext(context, {
    policy,
    assets,
    readInput: (target) => job.read(target, { signal: controller.signal }),
    onInputError: (error) => error instanceof JobLostError && controller.abort(error),
    log,
  });
  // As the harness expects the job: set before the page loads, never in its URL.
  await context.addInitScript((handOff) => {
    window.__RENDER_JOB__ = handOff;
  }, { payload, sink: { url: sink.url, token: sink.token } });
  return context;
}

/**
 * Renders one claimed job and reports how it ended. Never throws.
 *
 * @param {object} options
 * @param {object} options.claim What `claim` answered.
 * @param {ReturnType<import("./api.mjs").createApiClient>} options.api
 * @param {import("playwright").Browser} options.browser The slot's browser, self-checked.
 * @param {object} options.config `harnessUrl`, `profileName`, `tmpDir`, `assetPrefixes`.
 * @param {ReturnType<import("./assets.mjs").createAssetCache>} options.assets
 * @param {AbortSignal} options.stopping Aborted when the worker shuts down.
 * @returns {Promise<{ outcome: "completed" | "failed" | "lost", recycleBrowser: boolean }>}
 */
export async function runJob({ claim, api, browser, config, assets, stopping, log }) {
  const claimedAt = Date.now();
  const job = api.job(claim);
  const controller = new AbortController();
  const signal = controller.signal;
  const stop = () => controller.abort(new JobFailure("unknown", "The worker shut down."));
  stopping.addEventListener("abort", stop, { once: true });
  // Claimed as the worker began to stop: back to the queue at once.
  if (stopping.aborted) stop();
  const state = { progress: 0, stage: "loading" };
  const heartbeats = startHeartbeats(job, { seconds: claim.heartbeat_seconds, state, controller, log });
  let dir = null;
  let deadline = null;
  let sink = null;
  let context = null;
  try {
    dir = await mkdtemp(path.join(config.tmpDir, `job-${job.id}-`));
    const payload = await job.payload(signal);
    const runFor = (payload.limits?.max_runtime_seconds ?? DEFAULT_RUNTIME_SECONDS) * 1000 - (Date.now() - claimedAt);
    deadline = setTimeout(() => controller.abort(new JobFailure("timeout", "The job ran past its run time.")), Math.max(runFor, 0));
    const modelPath = path.join(dir, "model.glb");
    await downloadModel(job, payload, modelPath, signal);
    const outDir = path.join(dir, "out");
    await mkdir(outDir);
    sink = await startSink({
      origin: new URL(config.harnessUrl).origin,
      model: modelPath,
      outDir,
      names: payload.spec.output_names,
      onProgress: (entry) => {
        const changed = entry.stage !== state.stage;
        Object.assign(state, { progress: entry.progress, stage: entry.stage });
        if (changed) heartbeats.soon();
      },
    });
    context = await openJobContext(browser, { job, payload, sink, harnessUrl: config.harnessUrl, assets, assetPrefixes: config.assetPrefixes, controller, log });
    const result = await renderOnPage(context, { harnessUrl: config.harnessUrl, signal, log });
    // A job drawn by anything else than the profile promised doesn't complete: that browser is suspect.
    if (!PROFILES[config.profileName].accepts(result?.renderer)) {
      throw new JobFailure("gpu_lost", `The job drew with ${result?.renderer?.backend} on ${JSON.stringify(result?.renderer?.adapter)}.`, { recycleBrowser: true });
    }
    const outputs = collectOutputs(payload, result, sink);
    Object.assign(state, { stage: "uploading" });
    heartbeats.soon();
    const uploaded = await uploadOutputs(job, outputs, { signal, log });
    await completeJob(job, uploaded, result.renderer, { signal, log });
    log(`completed: ${uploaded.map((output) => `${output.name} (${output.bytes} bytes)`).join(", ")}`);
    return { outcome: "completed", recycleBrowser: false };
  } catch (error) {
    return await settleFailure(job, signal.aborted ? signal.reason : error, log);
  } finally {
    clearTimeout(deadline);
    heartbeats.stop();
    stopping.removeEventListener("abort", stop);
    await context?.close().catch(() => {});
    await sink?.close().catch(() => {});
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
