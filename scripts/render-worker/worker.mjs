#!/usr/bin/env node
/*
 * The render worker (ADR 0005, "The worker"): claims render jobs from the API and renders them
 * in the harness's export mode, in headless Chrome on the host's GPU. `WORKER_SLOTS` slots run
 * one job at a time each, with a browser of their own; every job gets a fresh browser context,
 * and a browser is replaced every `WORKER_RECYCLE_JOBS` jobs and after a crash. A browser whose
 * self-check finds another backend than the `WORKER_GPU` profile promises claims nothing: the
 * worker stops instead, as it does when it claims turntables and its ffmpeg has no libx264. See
 * scripts/render-worker/README.md to run one.
 */
import { fileURLToPath } from "node:url";
import { createApiClient } from "./api.mjs";
import { createAssetCache } from "./assets.mjs";
import { launchBrowser, selfCheck } from "./browser.mjs";
import { readConfig, VIDEO_KINDS } from "./config.mjs";
import { checkFfmpeg } from "./encode.mjs";
import { startHarness } from "./harness.mjs";
import { runJob } from "./job.mjs";

class SelfCheckFailed extends Error {
  constructor(reason) {
    super(`self-check failed, claiming nothing: ${reason}`);
    this.name = "SelfCheckFailed";
  }
}

const log = (message) => console.log(`[worker] ${message}`);

/** Waits `ms`, or less if the worker is stopping. */
const pause = (ms, stopping) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    stopping.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/** About `ms`, give or take a fifth, so idle slots and workers don't poll in step. */
const jittered = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4));

const describeAdapter = (renderer) =>
  `${renderer.backend} on ${[renderer.adapter?.vendor, renderer.adapter?.architecture, renderer.adapter?.device].filter(Boolean).join(" ") || "no adapter"}`;

/** One slot: its own browser, launched and self-checked before it claims, replaced when it must be. */
function createSlot(index, { config, assets }) {
  const slotLog = (message) => log(`slot ${index}: ${message}`);
  let browser = null;
  let jobsRun = 0;
  return {
    workerId: `${config.workerId}-${index}`,
    log: slotLog,
    async ready() {
      if (browser?.isConnected()) return browser;
      if (browser) slotLog("the browser went away; starting another");
      await browser?.close().catch(() => {});
      browser = await launchBrowser(config.profileName, { sandbox: config.sandbox });
      jobsRun = 0;
      const check = await selfCheck(browser, { profileName: config.profileName, harnessUrl: config.harnessUrl, assets });
      if (!check.ok) {
        await this.close();
        throw new SelfCheckFailed(check.reason);
      }
      slotLog(`Chrome ${browser.version()} (${config.profileName}): ${describeAdapter(check.renderer)}`);
      return browser;
    },
    async finished({ recycleBrowser }) {
      jobsRun += 1;
      if (recycleBrowser || jobsRun >= config.recycleAfterJobs) await this.close();
    },
    async close() {
      const closing = browser;
      browser = null;
      await closing?.close().catch(() => {});
    },
  };
}

/** Claims and renders jobs, one at a time, until the worker stops. */
async function runSlot(slot, { api, config, assets, stopping }) {
  while (!stopping.aborted) {
    const browser = await slot.ready();
    let claim;
    try {
      // Not aborted by a stop: a claim the API answered is failed back to the queue below.
      claim = await api.claim({ workerId: slot.workerId, kinds: config.kinds });
    } catch (error) {
      slot.log(`claim failed: ${error.message}`);
      await pause(jittered(config.pollMs), stopping);
      continue;
    }
    if (!claim) {
      await pause(jittered(config.pollMs), stopping);
      continue;
    }
    const jobLog = (message) => slot.log(`job ${claim.job_id}: ${message}`);
    jobLog(`claimed (${claim.kind})`);
    const result = await runJob({ claim, api, browser, config, assets, stopping, log: jobLog });
    await slot.finished(result);
  }
}

export async function main() {
  const config = readConfig();
  if (config.kinds.some((kind) => VIDEO_KINDS.includes(kind))) {
    try {
      log(`turntables encode with ${await checkFfmpeg(config.ffmpegPath)}`);
    } catch (error) {
      log(`${error.message}; claiming nothing (WORKER_FFMPEG names ffmpeg, WORKER_KINDS can leave turntables and Campaign Packs out)`);
      return 1;
    }
  }
  const stopper = new AbortController();
  const stopping = stopper.signal;
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      log(`${signal}: finishing up`);
      stopper.abort();
    });
  }
  let harness = null;
  let exitCode = 0;
  if (!config.harnessUrl) {
    harness = await startHarness({ appDir: config.appDir, port: config.harnessPort, log });
    config.harnessUrl = harness.url;
    harness.exited.then(({ code, signal }) => {
      if (stopping.aborted) return;
      log(`the harness server stopped (${code ?? signal}); stopping`);
      exitCode = 1;
      stopper.abort();
    });
  }
  log(`profile ${config.profileName}, ${config.slots} slot(s), kinds ${config.kinds.join(", ")}, harness ${config.harnessUrl}, API ${config.apiUrl}`);
  if (!config.sandbox) log("Chromium's sandbox is OFF (WORKER_CHROMIUM_SANDBOX=0): never run customers' jobs like this");
  const api = createApiClient({ baseUrl: config.apiUrl, workerToken: config.workerToken });
  const assets = createAssetCache({ dir: config.cacheDir, maxBytes: config.cacheMaxBytes, log });
  const slots = Array.from({ length: config.slots }, (_, index) => createSlot(index, { config, assets }));
  try {
    await Promise.all(
      slots.map((slot) =>
        runSlot(slot, { api, config, assets, stopping }).catch((error) => {
          // A failed self-check or a browser that won't start: no slot claims any more.
          log(error instanceof SelfCheckFailed ? `slot ${slots.indexOf(slot)}: ${error.message}` : `slot stopped: ${error.stack ?? error}`);
          exitCode = 1;
          stopper.abort();
        }),
      ),
    );
  } finally {
    await Promise.all(slots.map((slot) => slot.close()));
    await harness?.stop();
  }
  log(exitCode === 0 ? "stopped" : "stopped after an error");
  return exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message ?? error);
      process.exit(1);
    },
  );
}
