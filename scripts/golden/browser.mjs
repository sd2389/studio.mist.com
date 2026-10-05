import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { startSink } from "./sink.mjs";

export const LIGHTING_IDS = ["studio", "soft", "dark", "catalog", "dramatic"];
/**
 * Export-mode goldens: the job in `tests/goldens/fixtures/<id>.json`, rendered by the harness's
 * export mode as the render worker renders it (ADR 0005), on `EXPORT_BACKEND`. The golden is what
 * the page hands the sink, not a screenshot: a still's file, or a turntable's raw frames side by
 * side.
 */
export const EXPORT_IDS = ["export-still", "export-turntable"];
export const GOLDEN_IDS = [...EXPORT_IDS, ...LIGHTING_IDS];
/**
 * Frames the harness draws once the scene has loaded, before it reports ready. A render job takes
 * 60 (the export goldens too); a lighting golden only has to match itself from run to run, and on
 * SwiftShader every frame costs CI time.
 */
export const WARMUP_FRAMES = 24;
/**
 * What the export goldens draw with. CI uses WebGL 2, like the lighting goldens: on Linux, headless
 * Chromium's SwiftShader WebGPU either lost its device (the headless shell) or drew the live stage
 * into a canvas left at the default 300x150 (new headless), so frames went invalid and the readback
 * never returned. The export pipeline (cameras, sink, watermark, outputs) is the same either way;
 * WebGPU is checked by the worker's self-check on the GPU host. `GOLDEN_EXPORT_BACKEND=webgpu`
 * runs them on SwiftShader WebGPU instead.
 */
const EXPORT_BACKEND = process.env.GOLDEN_EXPORT_BACKEND === "webgpu" ? "webgpu" : "webgl";
export const BASE_URL = process.env.HARNESS_BASE_URL ?? "http://localhost:3000";
/** The model every golden draws; export jobs get it from the sink, as the worker serves it. */
const FIXTURE_MODEL = "public/test-fixtures/PDR-2413.glb";
/**
 * Captures running at once, each in its own browser: SwiftShader draws every page of one browser
 * in its single GPU process, one draw after another, so pages sharing a browser barely overlap.
 */
const CONCURRENCY = Number(process.env.GOLDEN_CONCURRENCY) || GOLDEN_IDS.length;
/** Loading plus the warm-up frames on a slow runner, with every capture running at once. */
const CAPTURE_TIMEOUT_MS = 5 * 60 * 1000;

/** Headless Chromium on SwiftShader. WebGPU gets no adapter here, so three.js draws with WebGL 2. */
export async function launchDeterministicBrowser() {
  return chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--disable-gpu", "--force-color-profile=srgb", "--hide-scrollbars"],
  });
}

const WEBGPU_ARGS = [
  "--enable-unsafe-webgpu",
  "--use-webgpu-adapter=swiftshader",
  "--use-angle=swiftshader",
  "--force-color-profile=srgb",
  "--hide-scrollbars",
];

/**
 * Ways to get WebGPU on SwiftShader, whatever GPU the machine has: the backend server exports
 * draw with (the worker's `swiftshader` profile in ADR 0005). None passes `--disable-gpu`, which
 * takes the GPU process away (WebGPU then gets an adapter but loses its device). What works
 * differs by platform: on Linux, Playwright's default headless shell loses the device, so new
 * headless (`channel: "chromium"`) and Vulkan SwiftShader are tried too. The first that passes
 * a smoke test is used, and every result is logged.
 */
const WEBGPU_LAUNCHES = [
  { name: "new headless, Vulkan SwiftShader", options: { channel: "chromium", args: [...WEBGPU_ARGS, "--enable-features=Vulkan", "--use-vulkan=swiftshader"] } },
  { name: "new headless", options: { channel: "chromium", args: WEBGPU_ARGS } },
  { name: "headless shell", options: { args: WEBGPU_ARGS } },
];

/** A device that survives a mapped buffer and a submit: what the exporter's first frame needs. */
async function webGpuSmokeTest() {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return { ok: false, failed: "no adapter" };
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
  return { ok: !error && !lost, architecture: adapter.info?.architecture, error: error?.message, lost };
}

let chosenLaunch;

/** The first launch whose WebGPU passes the smoke test on this machine, tried once per run. */
async function webGpuLaunch() {
  chosenLaunch ??= (async () => {
    for (const launch of WEBGPU_LAUNCHES) {
      let result;
      try {
        const browser = await chromium.launch({ headless: true, ...launch.options });
        try {
          const page = await browser.newPage();
          // A secure origin, as WebGPU needs; the probe page loads nothing heavy.
          await page.goto(`${BASE_URL}/render-harness?mode=probe`, { waitUntil: "domcontentloaded" });
          result = await page.evaluate(webGpuSmokeTest);
        } finally {
          await browser.close();
        }
      } catch (error) {
        result = { ok: false, failed: error.message.split("\n")[0] };
      }
      console.log(`WebGPU ${launch.name}: ${JSON.stringify(result)}`);
      if (result.ok) return launch;
    }
    throw new Error("WebGPU on SwiftShader failed the smoke test with every launch tried (see above)");
  })();
  return chosenLaunch;
}

export async function launchWebGpuBrowser() {
  const launch = await webGpuLaunch();
  return chromium.launch({ headless: true, ...launch.options });
}

async function waitForHarness(page, done) {
  await page.waitForFunction(
    (doneState) => window.__HARNESS_STATE__ === doneState || String(window.__HARNESS_STATE__).startsWith("error"),
    done,
  );
  return page.evaluate(() => window.__HARNESS_STATE__);
}

async function captureLighting(lighting, outDir) {
  const browser = await launchDeterministicBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(CAPTURE_TIMEOUT_MS);
    await page.goto(`${BASE_URL}/render-harness?lighting=${lighting}&size=512&warmup=${WARMUP_FRAMES}`, {
      waitUntil: "domcontentloaded",
    });
    const state = await waitForHarness(page, "ready");
    if (state !== "ready") throw new Error(`harness ${lighting}: ${state}`);
    // The harness stops drawing when it reports ready, so the canvas already holds the final frame.
    await page.locator("[data-harness-canvas] canvas").screenshot({ path: `${outDir}/${lighting}.png` });
    console.log(`captured ${lighting}`);
  } finally {
    await browser.close();
  }
}

/** A turntable's frames side by side, frame 0 on the left: the whole clip in one PNG. */
function frameStrip(frames, { width, height }) {
  const strip = new PNG({ width: width * frames.length, height });
  const rowBytes = width * 4;
  frames.forEach((frame, index) => {
    for (let y = 0; y < height; y += 1) {
      frame.copy(strip.data, (y * strip.width + index * width) * 4, y * rowBytes, (y + 1) * rowBytes);
    }
  });
  return PNG.sync.write(strip);
}

/** What an export golden compares: the still's image, or the strip of a turntable's frames. */
function exportedImage(id, payload, outputs, sink) {
  if (sink.progress.at(-1)?.progress !== 1) throw new Error(`harness ${id}: the page never reported it had finished`);
  if (payload.kind === "turntable") {
    const { frames } = payload.spec;
    if (sink.frames.length !== frames) throw new Error(`harness ${id}: the sink got ${sink.frames.length} of ${frames} frames`);
    return frameStrip(sink.frames, payload.spec);
  }
  const file = sink.files.get(outputs[0]?.name);
  if (!file) throw new Error(`harness ${id}: the sink did not get the finished image`);
  return file.body;
}

async function captureExport(id, outDir) {
  const payload = JSON.parse(readFileSync(`tests/goldens/fixtures/${id}.json`, "utf8"));
  // A turntable's frames come raw: the sink refuses any of another size.
  const frameSize = payload.kind === "turntable" ? { width: payload.spec.width, height: payload.spec.height } : null;
  const sink = await startSink({ model: readFileSync(FIXTURE_MODEL), origin: new URL(BASE_URL).origin, frameSize });
  const browser = EXPORT_BACKEND === "webgpu" ? await launchWebGpuBrowser() : await launchDeterministicBrowser();
  const console_ = [];
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(CAPTURE_TIMEOUT_MS);
    page.on("console", (message) => console_.push(`[${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console_.push(`[pageerror] ${error.message}`));
    // As the worker hands a job over: set before the page loads, never in the URL.
    await page.addInitScript((job) => {
      window.__RENDER_JOB__ = job;
    }, { payload, sink: { url: sink.url, token: sink.token } });
    await page.goto(`${BASE_URL}/render-harness?mode=export`, { waitUntil: "domcontentloaded" });
    const state = await waitForHarness(page, "done").catch(async (error) => {
      // Where it stopped: the page's last state, what reached the sink, and the page's own log.
      const seen = await page.evaluate(() => String(window.__HARNESS_STATE__)).catch(() => "unreadable");
      throw new Error(
        `harness ${id}: ${error.message}\nstate: ${seen}\nsink progress: ${JSON.stringify(sink.progress.map((entry, index) => ({ ...entry, at_ms: sink.progressAt[index] })).slice(-6))}, frames: ${sink.frames.length}\n${console_.slice(-40).join("\n")}`,
      );
    });
    if (state !== "done") throw new Error(`harness ${id}: ${state}`);
    const { renderer, outputs } = await page.evaluate(() => window.__RENDER_RESULT__);
    // The backend the run asked for, so a baseline never mixes the two.
    const wanted = EXPORT_BACKEND === "webgpu" ? renderer.backend === "webgpu" && renderer.adapter?.architecture === "swiftshader" : renderer.backend !== "webgpu";
    if (!wanted) {
      throw new Error(`harness ${id}: drew with ${renderer.backend} on ${JSON.stringify(renderer.adapter)}, not ${EXPORT_BACKEND}`);
    }
    writeFileSync(`${outDir}/${id}.png`, exportedImage(id, payload, outputs, sink));
    console.log(`captured ${id} (${renderer.backend}, ${renderer.adapter?.architecture ?? "no WebGPU adapter"})`);
  } finally {
    await browser.close();
    await sink.close();
  }
}

export async function captureAll(outDir) {
  mkdirSync(outDir, { recursive: true });
  const pending = GOLDEN_IDS.map((id) => (EXPORT_IDS.includes(id) ? () => captureExport(id, outDir) : () => captureLighting(id, outDir)));
  const captureNext = async () => {
    for (let capture = pending.shift(); capture; capture = pending.shift()) {
      await capture();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, captureNext));
}
