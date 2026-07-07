/**
 * Navigates to /render-harness?export=1&model=/test-fixtures/PDR-2413.3dm,
 * waits for the browser download event, and saves the GLB to
 * public/test-fixtures/PDR-2413.glb.
 *
 * The .3dm file is NOT in public/ (it is proprietary CAD and excluded from the
 * Docker image). Instead, a Playwright route intercept serves it from
 * samples/PDR-2413.3dm on disk so the harness URL remains identical.
 *
 * Usage: node scripts/golden/export-fixture.mjs
 */

import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchDeterministicBrowser, BASE_URL } from "./browser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "public/test-fixtures/PDR-2413.glb");

const browser = await launchDeterministicBrowser();
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Match on pathname, NOT a glob: the harness navigation URL ends with
  // "...&model=/test-fixtures/PDR-2413.3dm", so a "**/test-fixtures/PDR-2413.3dm"
  // glob would also intercept the page navigation itself and turn it into a
  // binary download ("page.goto: Download is starting").
  await page.route(
    (u) => u.pathname === "/test-fixtures/PDR-2413.3dm",
    (route) =>
      route.fulfill({
        body: readFileSync(path.join(PROJECT_ROOT, "samples/PDR-2413.3dm")),
        contentType: "application/octet-stream",
      }),
  );

  const url = `${BASE_URL}/render-harness?export=1&model=/test-fixtures/PDR-2413.3dm`;
  console.log(`Navigating to ${url}`);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.goto(url, { waitUntil: "domcontentloaded" }),
  ]);

  await download.saveAs(OUTPUT_PATH);
  console.log(`GLB fixture saved to ${OUTPUT_PATH}`);

  const { statSync } = await import("node:fs");
  const stat = statSync(OUTPUT_PATH);
  console.log(`File size: ${(stat.size / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
