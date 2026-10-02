import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

export const LIGHTING_IDS = ["studio", "soft", "dark", "catalog", "dramatic"];
/**
 * Frames the harness draws once the scene has loaded, before it reports ready. A render job takes
 * 60; a golden only has to match itself from run to run, and on SwiftShader every frame costs CI time.
 */
export const WARMUP_FRAMES = 24;
export const BASE_URL = process.env.HARNESS_BASE_URL ?? "http://localhost:3000";
/**
 * Captures running at once, each in its own browser: SwiftShader draws every page of one browser
 * in its single GPU process, one draw after another, so pages sharing a browser barely overlap.
 */
const CONCURRENCY = Number(process.env.GOLDEN_CONCURRENCY) || LIGHTING_IDS.length;
/** Loading plus the warm-up frames on a slow runner, with every capture running at once. */
const CAPTURE_TIMEOUT_MS = 5 * 60 * 1000;

export async function launchDeterministicBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--disable-gpu",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
    ],
  });
}

async function captureLighting(lighting, outDir) {
  const browser = await launchDeterministicBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(CAPTURE_TIMEOUT_MS);
    await page.goto(`${BASE_URL}/render-harness?lighting=${lighting}&size=512&warmup=${WARMUP_FRAMES}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => window.__HARNESS_STATE__ === "ready" || String(window.__HARNESS_STATE__).startsWith("error"),
    );
    const state = await page.evaluate(() => window.__HARNESS_STATE__);
    if (state !== "ready") throw new Error(`harness ${lighting}: ${state}`);
    // The harness stops drawing when it reports ready, so the canvas already holds the final frame.
    await page.locator("[data-harness-canvas] canvas").screenshot({ path: `${outDir}/${lighting}.png` });
    console.log(`captured ${lighting}`);
  } finally {
    await browser.close();
  }
}

export async function captureAll(outDir) {
  mkdirSync(outDir, { recursive: true });
  const pending = [...LIGHTING_IDS];
  const captureNext = async () => {
    for (let lighting = pending.shift(); lighting; lighting = pending.shift()) {
      await captureLighting(lighting, outDir);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, captureNext));
}
