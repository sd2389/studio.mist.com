/**
 * Regenerates public/test-fixtures/PDR-2413.glb, the model every golden draws, from
 * samples/PDR-2413.3dm through the render harness's convert mode: the upload page's Save, as a
 * bulk upload of that file runs it (ADR 0006). The page reads the file from a sink, as the render
 * worker serves a design's files, and hands back model.glb, thumbnail.webp and conversion.json.
 *
 * The .3dm is not in git (it is proprietary CAD, kept out of the Docker image too): put it in
 * samples/. Needs the worker's app (`BUILD_TARGET=worker`) at HARNESS_BASE_URL. Regenerating the
 * fixture means regenerating the goldens, which are pinned to its bytes (tests/goldens/README.md).
 *
 * Usage: node scripts/golden/export-fixture.mjs
 */

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSink } from "../render-worker/sink.mjs";
import { BASE_URL, launchDeterministicBrowser } from "./browser.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = path.join(PROJECT_ROOT, "samples/PDR-2413.3dm");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "public/test-fixtures/PDR-2413.glb");
const OUTPUT_NAMES = ["model.glb", "thumbnail.webp", "conversion.json"];
const TIMEOUT_MS = 5 * 60_000;

if (!existsSync(SOURCE)) {
  console.error(`${path.relative(PROJECT_ROOT, SOURCE)} is not here: it is not in git, so copy it into samples/ first.`);
  process.exit(1);
}

/** A convert job's spec as the API normalises one (convert_spec.py), on Studio's polygon cap. */
const spec = {
  source: { filename: path.basename(SOURCE), bytes: statSync(SOURCE).size },
  companions: [],
  units: "auto",
  max_polygons: 2_000_000,
  decimate: "auto",
  thumbnail: { size: 512, format: "webp" },
  output_names: OUTPUT_NAMES,
};

const outDir = mkdtempSync(path.join(os.tmpdir(), "golden-fixture-"));
const sink = await startSink({ origin: new URL(BASE_URL).origin, inputs: new Map([["/inputs/source", SOURCE]]), outDir, names: OUTPUT_NAMES });
const browser = await launchDeterministicBrowser();
try {
  const context = await browser.newContext();
  await context.addInitScript((handOff) => {
    window.__RENDER_JOB__ = handOff;
  }, { payload: { kind: "convert", spec, limits: { max_edge: 512, max_runtime_seconds: 600 } }, sink: { url: sink.url, token: sink.token } });
  const page = await context.newPage();
  console.log(`Converting ${path.relative(PROJECT_ROOT, SOURCE)} in ${BASE_URL}/render-harness?mode=convert`);
  await page.goto(`${BASE_URL}/render-harness?mode=convert`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
  await page.waitForFunction(() => window.__HARNESS_STATE__ === "done" || String(window.__HARNESS_STATE__).startsWith("error:"), null, { timeout: TIMEOUT_MS });
  const state = await page.evaluate(() => String(window.__HARNESS_STATE__));
  if (state !== "done") throw new Error(`the convert mode failed: ${state}`);

  copyFileSync(sink.files.get("model.glb").path, OUTPUT_PATH);
  const report = JSON.parse(readFileSync(sink.files.get("conversion.json").path, "utf8"));
  console.log(`GLB fixture saved to ${OUTPUT_PATH} (${(statSync(OUTPUT_PATH).size / 1024).toFixed(1)} KB)`);
  console.log(`${report.polygon_count} triangles, ${report.units.size_mm.join(" × ")} mm (${report.units.source}), roles ${JSON.stringify(report.roles)}`);
  for (const warning of report.warnings) console.log(`warning: ${warning}`);
} finally {
  await browser.close();
  await sink.close();
  rmSync(outDir, { recursive: true, force: true });
}
