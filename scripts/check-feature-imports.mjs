#!/usr/bin/env node
/**
 * Fail CI on imports that break the source layout:
 * - removed legacy paths (viewer/upload surface folders);
 * - the render harness's export pipeline (`src/features/render/harness/`, ADR 0005) imported
 *   from anywhere but itself and the harness route, which only the render worker's build has;
 * - the render job's token in page code: the harness holds none, the worker makes every API call.
 * Vendor/config paths are skipped.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

const FORBIDDEN = [
  { pattern: /@\/components\/viewer\b/, reason: "Use @/features/viewer instead" },
  { pattern: /@\/components\/upload\b/, reason: "Use @/features/upload instead" },
  {
    pattern: /__JOB_TOKEN__|X-Job-Token/i,
    reason: "The harness page holds no job token: the render worker makes every API call (ADR 0005)",
  },
];

/** The harness's worker-only modes, and the only files that may import them. */
const HARNESS_DIR = "src/features/render/harness";
const HARNESS_IMPORTERS = [`${HARNESS_DIR}/`, "src/app/render-harness/"];
// Static and dynamic imports, re-exports and side-effect imports.
const SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

/** The repo path an import points at, without extension; null for packages. */
function importTarget(specifier, fromFile) {
  if (specifier.startsWith("@/")) return posix.join("src", specifier.slice(2));
  if (specifier.startsWith(".")) return posix.join(posix.dirname(fromFile), specifier);
  return null;
}

function importsHarness(file, text) {
  if (HARNESS_IMPORTERS.some((prefix) => file.startsWith(prefix))) return false;
  for (const [, specifier] of text.matchAll(SPECIFIER)) {
    const target = importTarget(specifier, file);
    if (target === HARNESS_DIR || target?.startsWith(`${HARNESS_DIR}/`)) return true;
  }
  return false;
}

const failures = [];
for (const path of walk(SRC)) {
  const file = relative(ROOT, path).split(sep).join("/");
  const text = readFileSync(path, "utf8");
  for (const { pattern, reason } of FORBIDDEN) {
    if (pattern.test(text)) failures.push({ file, reason, pattern: pattern.source });
  }
  if (importsHarness(file, text)) {
    failures.push({
      file,
      reason: "Only the render harness route (src/app/render-harness/page.worker.tsx) may import the harness (ADR 0005)",
      pattern: HARNESS_DIR,
    });
  }
}

if (failures.length) {
  console.error("Feature import boundary violations:\n");
  for (const f of failures) console.error(`  ${f.file}\n    → ${f.reason} (${f.pattern})\n`);
  process.exit(1);
}
console.log("Feature import boundaries OK");
