import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import path from "node:path";
import { ApiError, JobLostError } from "./api.mjs";
import { PAGE_VIEWPORT, PROFILES } from "./browser.mjs";
import { CONVERT_KIND, CONVERT_MODE } from "./convert.mjs";
import { JobFailure } from "./failure.mjs";
import { guardContext, pagePolicy } from "./network.mjs";
import { startOutputs } from "./outputs.mjs";
import { jobProgress } from "./progress.mjs";
import { startSink } from "./sink.mjs";

/*
 * One job, start to end (ADR 0005, "Process"): payload → the model into the job's folder → a
 * sink with a fresh token (and, for a turntable, ffmpeg behind it) → the harness's export mode in
 * a fresh browser context → a turntable's MP4 finished or a spin's ZIP written → uploads →
 * complete, with heartbeats all along. Any failure is reported with a code, except when the API
 * has taken the job back (401, 404 or 409), which drops it.
 */

/** Tries for one PUT, as the ADR says, asking for fresh URLs when storage refuses one. */
const PUT_ATTEMPTS = 3;
/** Upload URLs are signed for 15 minutes; ask again a minute before they lapse. */
const UPLOAD_URLS_FOR_MS = 14 * 60_000;
/** A still's run time limit (MAX_RUNTIME_SECONDS in the API), for a payload that gives none. */
const DEFAULT_RUNTIME_SECONDS = 300;
/** three.js logs this when WebGPU loses its device (a destroyed device it doesn't report). */
const DEVICE_LOST = /Device Lost/;

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
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

/** Rejects with the signal's reason once it aborts. */
const aborted = (signal) =>
  new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

/**
 * Heartbeats every `seconds`, and at once when the job changes stage, carrying what `report()`
 * says of its progress; a cancel or a lost job aborts it. One heartbeat at a time: a change
 * during one goes right after.
 */
function startHeartbeats(job, { seconds, report, controller, log }) {
  let busy = false;
  let again = false;
  let stopped = false;
  const beat = async () => {
    if (stopped || controller.signal.aborted) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      const answer = await job.heartbeat(report());
      if (answer?.cancel) controller.abort(new JobFailure("canceled", "The job was canceled or ran past its run time."));
    } catch (error) {
      if (error instanceof JobLostError) controller.abort(error);
      else log(`heartbeat failed: ${error.message}`);
    } finally {
      busy = false;
      if (again) {
        again = false;
        void beat();
      }
    }
  };
  const timer = setInterval(beat, seconds * 1000);
  return {
    now: () => void beat(),
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
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

/**
 * How a render job runs: its scene's model into the sink, the export mode, the catalogue's assets.
 * A convert job runs in the convert mode instead (CONVERT_MODE in convert.mjs).
 */
const EXPORT_MODE = {
  page: "export",
  async fetchInputs(job, payload, dir, signal) {
    const model = path.join(dir, "model.glb");
    await downloadModel(job, payload, model, signal);
    return { model };
  },
  startOutputs,
  handOff: (payload) => payload,
  failure: pageFailure,
  assetPrefixes: (config) => config.assetPrefixes,
  /** An asset that can't be had is logged and the page goes on, as the browser would. */
  assetFailure: null,
};

const modeOf = (payload) => (payload.kind === CONVERT_KIND ? CONVERT_MODE : EXPORT_MODE);

/** Opens the job's mode and waits until the page says it is done, or fails, crashes or is stopped. */
async function renderOnPage(context, { harnessUrl, mode, signal, log }) {
  signal.throwIfAborted();
  const page = await context.newPage();
  const failure = new Promise((_, reject) => {
    page.once("crash", () => reject(new JobFailure("browser_crashed", "The page crashed.", { recycleBrowser: true })));
    page.on("console", (message) => {
      if (message.type() === "error" && DEVICE_LOST.test(message.text())) {
        reject(new JobFailure("gpu_lost", message.text().split("\n").join(" "), { recycleBrowser: true }));
      }
    });
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    if (signal.aborted) reject(signal.reason);
  });
  page.on("pageerror", (error) => log(`page error: ${error.message}`));
  const done = (async () => {
    await page.goto(`${harnessUrl}/render-harness?mode=${mode.page}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(
      () => window.__HARNESS_STATE__ === "done" || String(window.__HARNESS_STATE__).startsWith("error:"),
      null,
      { timeout: 0, polling: 250 },
    );
    return page.evaluate(() => ({ state: String(window.__HARNESS_STATE__), result: window.__RENDER_RESULT__ ?? null }));
  })();
  const { state, result } = await race(done, failure);
  if (state !== "done") throw mode.failure(state.slice("error:".length), result);
  return result;
}

/** PUTs every output where the API says, asking for new URLs when they near expiry or storage refuses one. */
async function uploadOutputs(job, outputs, { signal, log }) {
  const ask = async () => {
    try {
      const { files } = await job.uploads(outputs.map(({ name, content_type, bytes }) => ({ name, content_type, bytes })), signal);
      return { at: Date.now(), byName: new Map(files.map((target) => [target.name, target])) };
    } catch (error) {
      // A file over its cap ("files[0].bytes: at most …", upload_targets in the API) stays over it.
      if (error instanceof ApiError && error.status === 400) throw new JobFailure(/\.bytes: at most/.test(error.message) ? "over_limit" : "upload_failed", error.message);
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

/**
 * Why a job input the page asked for couldn't be had, as the reason the job stops: the API took
 * the job back, the input is gone (final, so the credits go back), or it may work on a retry.
 * The page must never render on without it, or a backdrop would silently fall back to a colour.
 */
export function inputFailure(error) {
  if (error instanceof JobLostError) return error;
  const gone = error instanceof ApiError && [403, 404, 410].includes(error.status);
  return new JobFailure(gone ? "input_missing" : "unknown", `A job input could not be fetched: ${error?.message || error}`);
}

async function openJobContext(browser, { job, payload, mode, sink, harnessUrl, assets, config, controller, log }) {
  const context = await browser.newContext({ viewport: PAGE_VIEWPORT, deviceScaleFactor: 1, serviceWorkers: "block", acceptDownloads: false });
  const policy = pagePolicy({
    harnessOrigin: harnessUrl,
    sinkOrigin: sink.url,
    jobId: job.id,
    inputUrls: signedInputs(payload),
    assetPrefixes: mode.assetPrefixes(config),
    vendoredUrls: assets.vendored ?? [],
  });
  await guardContext(context, {
    policy,
    assets,
    readInput: (target) => job.read(target, { signal: controller.signal }),
    onInputError: (error) => controller.abort(inputFailure(error)),
    onAssetError: (error, url) => mode.assetFailure && controller.abort(mode.assetFailure(error, url)),
    log,
  });
  // As the harness expects the job: set before the page loads, never in its URL.
  await context.addInitScript((handOff) => {
    window.__RENDER_JOB__ = handOff;
  }, { payload: mode.handOff(payload), sink: { url: sink.url, token: sink.token } });
  return context;
}

/**
 * Renders one claimed job and reports how it ended. Never throws.
 *
 * @param {object} options
 * @param {object} options.claim What `claim` answered.
 * @param {ReturnType<import("./api.mjs").createApiClient>} options.api
 * @param {import("playwright").Browser} options.browser The slot's browser, self-checked.
 * @param {object} options.config `harnessUrl`, `profileName`, `tmpDir`, `assetPrefixes`, `ffmpegPath`.
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
  const browserExited = () => controller.abort(new JobFailure("browser_crashed", "The browser exited.", { recycleBrowser: true }));
  browser.once("disconnected", browserExited);
  /** The stage, and the shares of the job rendered (as the page reports it) and encoded. */
  const done = { stage: "loading", rendered: 0, encoded: 0 };
  const heartbeats = startHeartbeats(job, { seconds: claim.heartbeat_seconds, report: () => jobProgress(claim.kind, done), controller, log });
  const enterStage = (stage) => {
    done.stage = stage;
    heartbeats.now();
  };
  let dir = null;
  let deadline = null;
  let outputs = null;
  let sink = null;
  let context = null;
  try {
    dir = await mkdtemp(path.join(config.tmpDir, `job-${job.id}-`));
    const payload = await job.payload(signal);
    heartbeats.now();
    const runFor = (payload.limits?.max_runtime_seconds ?? DEFAULT_RUNTIME_SECONDS) * 1000 - (Date.now() - claimedAt);
    deadline = setTimeout(() => controller.abort(new JobFailure("timeout", "The job ran past its run time.")), Math.max(runFor, 0));
    const mode = modeOf(payload);
    const inputs = await mode.fetchInputs(job, payload, dir, signal);
    const outDir = path.join(dir, "out");
    await mkdir(outDir);
    outputs = mode.startOutputs(payload, {
      outDir,
      ffmpegPath: config.ffmpegPath,
      onEncoded: (share) => {
        done.encoded = share;
      },
      onFailure: (failure) => controller.abort(failure),
    });
    sink = await startSink({
      origin: new URL(config.harnessUrl).origin,
      ...inputs,
      outDir,
      ...outputs.sink,
      onProgress: (entry) => {
        done.rendered = entry.progress;
        if (entry.stage !== done.stage) enterStage(entry.stage);
      },
    });
    context = await openJobContext(browser, { job, payload, mode, sink, harnessUrl: config.harnessUrl, assets, config, controller, log });
    const result = await renderOnPage(context, { harnessUrl: config.harnessUrl, mode, signal, log });
    // A job drawn by anything else than the profile promised doesn't complete: that browser is suspect.
    if (!PROFILES[config.profileName].accepts(result?.renderer)) {
      throw new JobFailure("gpu_lost", `The job drew with ${result?.renderer?.backend} on ${JSON.stringify(result?.renderer?.adapter)}.`, { recycleBrowser: true });
    }
    if (outputs.encodes) enterStage("encoding");
    // Within the run time: a timeout or a cancel stops ffmpeg or the ZIP too.
    const files = await race(outputs.finish(result, sink, signal), aborted(signal));
    signal.throwIfAborted();
    enterStage("uploading");
    const uploaded = await uploadOutputs(job, files, { signal, log });
    await completeJob(job, uploaded, result.renderer, { signal, log });
    log(`completed: ${uploaded.map((output) => `${output.name} (${output.bytes} bytes)`).join(", ")}`);
    return { outcome: "completed", recycleBrowser: false };
  } catch (error) {
    return await settleFailure(job, signal.aborted ? signal.reason : error, log);
  } finally {
    clearTimeout(deadline);
    heartbeats.stop();
    stopping.removeEventListener("abort", stop);
    browser.off("disconnected", browserExited);
    // ffmpeg first: a page waiting on the sink may be waiting on it.
    await outputs?.stop().catch(() => {});
    await context?.close().catch(() => {});
    await sink?.close().catch(() => {});
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
