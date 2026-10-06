import { chromium } from "playwright";
import { guardContext, pagePolicy } from "./network.mjs";

/*
 * The browser a slot renders in (ADR 0005, "Browser"): Chrome for Testing in new headless mode
 * (Playwright's `channel: "chromium"`), the only headless mode that gets a GPU adapter, with
 * Chromium's sandbox on. Each profile says which flags give WebGPU where, and what the probe must
 * find there; a browser whose probe disagrees claims nothing.
 */

const COMMON_ARGS = ["--force-color-profile=srgb", "--hide-scrollbars"];

const isWebGpu = (renderer) => renderer?.backend === "webgpu" && Boolean(renderer.adapter);

export const PROFILES = {
  /** Linux GPU hosts: Vulkan under ANGLE and Dawn, on the NVIDIA driver the container toolkit mounts. */
  nvidia: {
    args: [
      "--enable-unsafe-webgpu",
      "--use-angle=vulkan",
      "--enable-features=Vulkan,VulkanFromANGLE",
      "--disable-vulkan-surface",
      "--ignore-gpu-blocklist",
      ...COMMON_ARGS,
    ],
    promise: "WebGPU on an NVIDIA GPU",
    accepts: (renderer) => isWebGpu(renderer) && /nvidia/i.test(renderer.adapter.vendor),
  },
  /** A Mac, for local development: new headless gets the Metal GPU with no flags. */
  metal: {
    args: COMMON_ARGS,
    promise: "WebGPU on the Mac's GPU (Metal)",
    accepts: (renderer) => isWebGpu(renderer) && renderer.adapter.vendor === "apple",
  },
  /**
   * CI and CPU-only hosts: WebGPU on SwiftShader, slow but the backend production draws with. Vulkan
   * SwiftShader in new headless; on Linux the headless shell's SwiftShader WebGPU loses its device.
   */
  swiftshader: {
    args: [
      "--enable-unsafe-webgpu",
      "--use-webgpu-adapter=swiftshader",
      "--use-angle=swiftshader",
      "--enable-features=Vulkan",
      "--use-vulkan=swiftshader",
      ...COMMON_ARGS,
    ],
    promise: "WebGPU on SwiftShader (CPU)",
    accepts: (renderer) => isWebGpu(renderer) && renderer.adapter.architecture === "swiftshader",
  },
};

/** The harness's export stage is at most 512 px; this leaves room around it. */
export const PAGE_VIEWPORT = { width: 800, height: 800 };

/** Environment variables a browser never needs: anything that looks like a credential. */
const SECRET_ENV = /TOKEN|SECRET|PASSWORD|PASSWD|KEY|CREDENTIAL|AUTH|DSN|^AWS_|^R2_|^STRIPE_|^DATABASE_URL$/i;

/** The worker's environment without its secrets: a compromised renderer finds no token in /proc. */
export function browserEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !SECRET_ENV.test(name)));
}

/**
 * @param {keyof typeof PROFILES} profileName
 * @param {{ sandbox?: boolean }} [options]
 */
export function launchBrowser(profileName, { sandbox = true } = {}) {
  const profile = PROFILES[profileName];
  return chromium.launch({
    channel: "chromium",
    headless: true,
    chromiumSandbox: sandbox,
    args: profile.args,
    env: browserEnv(),
  });
}

/** A device that survives a mapped buffer and a submit: what a job's first frame needs. */
async function gpuSmokeTest() {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return { ok: false, failed: "no WebGPU adapter" };
  const device = await adapter.requestDevice();
  let lost = null;
  device.lost.then((info) => {
    lost = info.message || String(info.reason);
  });
  device.pushErrorScope("validation");
  const buffer = device.createBuffer({ size: 48, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
  new Float32Array(buffer.getMappedRange()).fill(1);
  buffer.unmap();
  device.queue.submit([device.createCommandEncoder().finish()]);
  await device.queue.onSubmittedWorkDone();
  const error = await device.popErrorScope();
  device.destroy();
  return { ok: !error && !lost, failed: error?.message ?? lost ?? null };
}

/**
 * The self-check (ADR 0005): opens the harness's `?mode=probe` and reports what three.js draws
 * with there, and whether a WebGPU device survives a submit. `ok` only when that is what the
 * profile promises; the worker claims nothing otherwise.
 *
 * @returns {Promise<{ ok: boolean, renderer: object | null, reason: string | null }>}
 */
export async function selfCheck(browser, { profileName, harnessUrl, assets, timeoutMs = 120_000 }) {
  const profile = PROFILES[profileName];
  const context = await browser.newContext({ viewport: PAGE_VIEWPORT, serviceWorkers: "block" });
  try {
    await guardContext(context, { policy: pagePolicy({ harnessOrigin: harnessUrl }), assets });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.goto(`${harnessUrl}/render-harness?mode=probe`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__HARNESS_STATE__ === "ready" || String(window.__HARNESS_STATE__).startsWith("error"));
    const state = await page.evaluate(() => String(window.__HARNESS_STATE__));
    if (state !== "ready") return { ok: false, renderer: null, reason: `the probe page says ${state}` };
    const renderer = await page.evaluate(() => window.__RENDER_RESULT__?.renderer ?? null);
    if (!profile.accepts(renderer)) {
      const found = renderer ? `${renderer.backend} on ${JSON.stringify(renderer.adapter)}` : "nothing";
      return { ok: false, renderer, reason: `profile "${profileName}" promises ${profile.promise}, the probe found ${found}` };
    }
    const smoke = await page.evaluate(gpuSmokeTest);
    if (!smoke.ok) return { ok: false, renderer, reason: `the WebGPU device failed a submit: ${smoke.failed}` };
    return { ok: true, renderer, reason: null };
  } finally {
    await context.close();
  }
}
