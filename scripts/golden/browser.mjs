import { chromium } from "playwright";

export const LIGHTING_IDS = ["studio", "soft", "dark", "catalog", "dramatic"];
export const BASE_URL = process.env.HARNESS_BASE_URL ?? "http://localhost:3000";

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

export async function captureAll(outDir) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(outDir, { recursive: true });
  const browser = await launchDeterministicBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const lighting of LIGHTING_IDS) {
      const url = `${BASE_URL}/render-harness?lighting=${lighting}&size=512`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => window.__HARNESS_STATE__ === "ready" || String(window.__HARNESS_STATE__).startsWith("error"),
        { timeout: 120_000 },
      );
      const state = await page.evaluate(() => window.__HARNESS_STATE__);
      if (state !== "ready") throw new Error(`harness ${lighting}: ${state}`);
      await page.waitForTimeout(4000); // HDRI/env settle
      const canvas = page.locator("[data-harness-canvas] canvas");
      await canvas.screenshot({ path: `${outDir}/${lighting}.png` });
      console.log(`captured ${lighting}`);
    }
  } finally {
    await browser.close();
  }
}
