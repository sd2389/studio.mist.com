#!/usr/bin/env node
/**
 * Fail CI if application code imports removed legacy paths (viewer/upload surface folders).
 * Vendor/config paths are skipped.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

const FORBIDDEN = [
  { pattern: /@\/components\/viewer\b/, reason: "Use @/features/viewer instead" },
  { pattern: /@\/components\/upload\b/, reason: "Use @/features/upload instead" },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const failures = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const { pattern, reason } of FORBIDDEN) {
    if (pattern.test(text)) failures.push({ file, reason, pattern: pattern.source });
  }
}

if (failures.length) {
  console.error("Feature import boundary violations:\n");
  for (const f of failures) console.error(`  ${f.file}\n    → ${f.reason} (${f.pattern})\n`);
  process.exit(1);
}
console.log("Feature import boundaries OK");
