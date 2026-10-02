#!/usr/bin/env node
/**
 * Regenerates the bundled models from the procedural CAD library (`src/lib/jewelry-cad`):
 *
 *   public/models/mist-solitaire/ring.glb   landing hero + /viewer/mist-solitaire
 *   public/models/samples/solitaire.glb     upload page sample
 *   public/models/samples/halo.glb          upload page sample
 *
 * Usage: node scripts/create-showcase-ring.mjs
 *
 * The library is TypeScript with `@/` imports, so it is loaded through Vite's module
 * runner — Vite ships with the existing vitest devDependency; nothing extra to install.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { module } = await runnerImport(path.join(root, "scripts/showcase/showcase-assets.ts"), {
  configFile: false,
  root,
  logLevel: "error",
  resolve: { alias: { "@": path.join(root, "src") } },
});

for (const asset of await module.buildShowcaseAssets()) {
  const target = path.join(root, asset.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(asset.bytes));
  console.log(`${asset.path}  ${(asset.bytes.byteLength / 1024).toFixed(0)} KB  — ${asset.summary}`);
}
