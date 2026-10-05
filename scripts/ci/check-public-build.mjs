#!/usr/bin/env node
// Checks a production build made without BUILD_TARGET=worker, the app as it ships: it has no
// render harness route at all, and none of its code carries the harness (ADR 0005).
//   node scripts/ci/check-public-build.mjs [distDir]   (default: $NEXT_BUILD_DIR or .next)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Strings only the harness page's code holds: its state, and the job the worker hands it. */
const HARNESS_MARKERS = ["__HARNESS_STATE__", "__RENDER_JOB__"];
const ROUTE = "render-harness";

function filesUnder(dir, extensions) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const distDir = process.argv[2] ?? process.env.NEXT_BUILD_DIR ?? ".next";
const problems = [];

if (!existsSync(path.join(distDir, "BUILD_ID"))) problems.push(`no production build in ${distDir}`);

// The route itself: its server output and its manifest entry.
const appDir = path.join(distDir, "server", "app");
for (const entry of existsSync(appDir) ? readdirSync(appDir) : []) {
  if (entry.startsWith(ROUTE)) problems.push(`route output ${path.join(appDir, entry)}`);
}
const manifest = path.join(distDir, "server", "app-paths-manifest.json");
if (existsSync(manifest) && Object.keys(JSON.parse(readFileSync(manifest, "utf8"))).some((page) => page.startsWith(`/${ROUTE}/`))) {
  problems.push(`${manifest} lists /${ROUTE}`);
}

// Its code, in any chunk the browser or the server loads.
const built = [...filesUnder(path.join(distDir, "static"), /\.js$/), ...filesUnder(path.join(distDir, "server"), /\.(js|json|html|rsc)$/)];
for (const file of built) {
  const text = readFileSync(file, "utf8");
  const found = HARNESS_MARKERS.filter((marker) => text.includes(marker));
  if (found.length) problems.push(`${file} carries the harness (${found.join(", ")})`);
}

// A marker the code no longer uses would let the chunk check pass for nothing.
const source = filesUnder("src", /(?<!\.d)\.tsx?$/).map((file) => readFileSync(file, "utf8")).join("\n");
for (const marker of HARNESS_MARKERS.filter((marker) => !source.includes(marker))) {
  problems.push(`no source file mentions ${marker} any more: update HARNESS_MARKERS`);
}

if (problems.length) {
  console.error(`The public build carries the render harness:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`The public build has no render harness (${distDir}, ${built.length} files checked)`);
