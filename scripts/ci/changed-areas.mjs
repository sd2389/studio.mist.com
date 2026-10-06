#!/usr/bin/env node
// Reads changed file paths (one per line) on stdin and prints which parts of CI they need, as
// GitHub step outputs:
//   web=true      lint, type check and frontend unit tests
//   backend=true  backend unit tests
//   render=true   render goldens: any file the render-harness page (worker build only) can load,
//                 and the scripts that capture it (the export goldens write to the worker's sink)
// Changes to CI itself or to dependencies run everything; docs alone run nothing.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The golden page and the layout around it. */
const HARNESS_ENTRIES = ["src/app/layout.tsx", "src/app/render-harness/page.worker.tsx"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".css"];
// Static and dynamic imports, re-exports, side-effect imports and CSS @import.
const SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+|@import\s+)["']([^"']+)["']/g;

function resolveImport(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = path.posix.join("src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.posix.join(path.posix.dirname(fromFile), specifier);
  else return null; // a package: covered by the lockfile rule
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => path.posix.join(base, `index${ext}`)),
  ];
  return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? null;
}

/**
 * Every source file the render harness can load, found by following imports from its page and
 * the root layout. Over-matching (a type-only import, a commented-out one) only runs the
 * goldens when they were not needed; under-matching never happens for a file that is imported.
 */
export function harnessFiles(entries = HARNESS_ENTRIES) {
  const seen = new Set();
  const queue = entries.filter((file) => existsSync(file));
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(SPECIFIER)) {
      const target = resolveImport(match[1], file);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

export function changedAreas(paths, rendered = harnessFiles()) {
  const areas = { web: false, backend: false, render: false };
  for (const file of paths) {
    if (!file) continue;
    if (file.startsWith(".github/") || file.startsWith("scripts/ci/") || file === "package.json" || file === "package-lock.json") {
      return { web: true, backend: true, render: true };
    }
    if (file.startsWith("backend/")) {
      areas.backend = true;
    } else if (file.endsWith(".md") || file.startsWith("docs/") || file.startsWith("LICENSE") || file === ".gitignore" || file === ".env.example") {
      // Docs need no checks.
    } else if (
      rendered.has(file) ||
      /^(public|scripts\/golden|scripts\/render-worker|tests\/goldens|src\/app\/render-harness)\//.test(file) ||
      /^(next\.config\.|postcss\.config\.|tsconfig\.json$)/.test(file)
    ) {
      areas.web = true;
      areas.render = true;
    } else {
      areas.web = true;
    }
  }
  return areas;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = readFileSync(0, "utf8").split("\n").map((line) => line.trim());
  const areas = changedAreas(paths);
  for (const [name, value] of Object.entries(areas)) console.log(`${name}=${value}`);
}
