# Golden-Image Benchmark Implementation Plan (Phase 1B-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeatable render-quality benchmark: a harness page renders a reference CAD model through the real viewer pipeline in headless Chromium, and an SSIM check against committed golden images fails CI when render quality regresses.

**Architecture:** A dev/CI-only Next.js page (`/render-harness`) mounts the production `ViewerCanvas` with a fixture model converted by the production `.3dm→GLB` pipeline — parity by construction. A Playwright script captures the canvas per lighting preset; a check script compares captures to committed goldens with SSIM. Software rendering (SwiftShader) in headless Chromium keeps output consistent across machines; the SSIM threshold absorbs raster noise.

**Tech Stack:** Next.js 16, Playwright (chromium, script API — not @playwright/test), ssim.js, pngjs, GitHub Actions.

**Follow-up plan (separate):** 1B-2 — render-job service (render_credits, job queue, worker, R2 upload). The harness page built here is reused by that worker.

## Global Constraints

- TypeScript strict; zero `any`; no `@ts-ignore`. UI in `src/features/*/ui` or `src/app`; pure logic in `src/lib`.
- Do not modify anything under `src/features/render/` (export-parity invariant test enforces no `viewer-quality` import there; broader changes there are out of scope).
- Goldens are environment-pinned: captured and checked ONLY under headless Chromium with SwiftShader (`--use-angle=swiftshader`), `deviceScaleFactor: 1`. Never regenerate goldens on a desktop GPU.
- SSIM pass threshold: **≥ 0.98** per image. Self-test sanity bound: SSIM(studio golden, dark golden) **< 0.95**.
- Harness page must 404 in production builds unless `NEXT_PUBLIC_ENABLE_RENDER_HARNESS=1`.
- Lighting presets (all five): `studio`, `soft`, `dark`, `catalog`, `dramatic`. Default material preset for goldens: `gold-18k-yellow`. Capture size: 512×512.
- All commands run from repo root `/home/smitdesai/Coding/studio.devjewels.com/jewelry-renderer`.

---

### Task 1: Render-harness page + fixture

**Files:**
- Create: `public/test-fixtures/PDR-2413.3dm` (copy of `samples/PDR-2413.3dm`)
- Create: `src/app/render-harness/page.tsx`
- Create: `src/features/viewer/ui/RenderHarness.tsx`

**Interfaces:**
- Consumes: `ViewerCanvas` props (`modelUrl: string; preset: MaterialPresetId; autoRotate: boolean; lighting: LightingPresetId` — from `src/features/viewer/ui/ViewerCanvas.tsx:47-59`), `convertUploadToGlb` from `src/lib/convert/to-glb.ts:47`.
- Produces (consumed by Tasks 2–3 and later by the 1B-2 worker): page at `/render-harness?lighting=<id>&size=<px>&preset=<id>&model=<url>` which sets `window.__HARNESS_STATE__ = "ready"` when the model is converted and mounted, `"error:<message>"` on failure.

- [ ] **Step 1: Copy the fixture into public/**

```bash
mkdir -p public/test-fixtures && cp samples/PDR-2413.3dm public/test-fixtures/PDR-2413.3dm
```

- [ ] **Step 2: Create the harness client component**

Create `src/features/viewer/ui/RenderHarness.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ViewerCanvas } from "@/features/viewer/ui/ViewerCanvas";
import { convertUploadToGlb } from "@/lib/convert/to-glb";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";

const LIGHTING_IDS: readonly LightingPresetId[] = ["studio", "soft", "dark", "catalog", "dramatic"];

declare global {
  interface Window {
    __HARNESS_STATE__?: string;
  }
}

function isLighting(v: string | null): v is LightingPresetId {
  return v !== null && (LIGHTING_IDS as readonly string[]).includes(v);
}

/** Deterministic render target for golden-image benchmarks. Not linked from any UI. */
export function RenderHarness() {
  const params = useSearchParams();
  const lighting: LightingPresetId = isLighting(params.get("lighting")) ? (params.get("lighting") as LightingPresetId) : "studio";
  const preset = (params.get("preset") ?? "gold-18k-yellow") as MaterialPresetId;
  const size = Number(params.get("size") ?? 512);
  const modelPath = params.get("model") ?? "/test-fixtures/PDR-2413.3dm";
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    window.__HARNESS_STATE__ = "loading";
    (async () => {
      const res = await fetch(modelPath);
      if (!res.ok) throw new Error(`fetch ${modelPath}: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], modelPath.split("/").pop() ?? "model.3dm");
      const converted = await convertUploadToGlb(file);
      // convertUploadToGlb returns the GLB payload — check to-glb.ts:47 for the
      // exact field (ArrayBuffer/Blob). Wrap in a Blob if it is a raw buffer.
      const glbBlob = converted instanceof Blob ? converted : new Blob([converted as unknown as ArrayBuffer], { type: "model/gltf-binary" });
      objectUrl = URL.createObjectURL(glbBlob);
      setModelUrl(objectUrl);
    })().catch((e: unknown) => {
      window.__HARNESS_STATE__ = `error:${e instanceof Error ? e.message : String(e)}`;
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [modelPath]);

  useEffect(() => {
    if (!modelUrl) return;
    // Give the canvas frames to load HDRI + compile shaders before flagging ready.
    let frames = 0;
    let raf = 0;
    const tick = () => {
      frames += 1;
      if (frames >= 60) {
        window.__HARNESS_STATE__ = "ready";
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [modelUrl]);

  return (
    <div style={{ width: size, height: size }} data-harness-canvas>
      {modelUrl ? (
        <ViewerCanvas modelUrl={modelUrl} preset={preset} autoRotate={false} lighting={lighting} />
      ) : null}
    </div>
  );
}
```

The `converted instanceof Blob` line is the one permitted adaptation point: open `src/lib/convert/to-glb.ts:47`, read `convertUploadToGlb`'s actual return type, and unwrap the GLB bytes accordingly (e.g. `converted.glb`, `converted.buffer`) so `glbBlob` is a valid GLB Blob. Quote the final line in your report.

If `ViewerCanvas` is not exported from a barrel, import via the direct path shown. If additional required props exist beyond the four used (check the type at ViewerCanvas.tsx:47), pass the minimal defaults the type requires and list them in your report.

- [ ] **Step 3: Create the page with production guard**

Create `src/app/render-harness/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RenderHarness } from "@/features/viewer/ui/RenderHarness";

export const dynamic = "force-dynamic";

export default function RenderHarnessPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_RENDER_HARNESS !== "1") {
    notFound();
  }
  return (
    <Suspense fallback={null}>
      <RenderHarness />
    </Suspense>
  );
}
```

- [ ] **Step 4: Verify manually in dev**

```bash
npm run dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/render-harness?lighting=studio"
```

Expected: `200`. Then stop the dev server (`kill %1`).

- [ ] **Step 5: Tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 20/20 pass; no NEW tsc errors (baseline: 11 pre-existing).

- [ ] **Step 6: Commit**

```bash
git add public/test-fixtures/PDR-2413.3dm src/app/render-harness/page.tsx src/features/viewer/ui/RenderHarness.tsx
git commit -m "feat: render-harness page for golden-image benchmarks"
```

---

### Task 2: Capture script + dependencies

**Files:**
- Modify: `package.json` (devDependencies: `playwright`, `ssim.js`, `pngjs`, `@types/pngjs`; scripts: `golden:capture`, `test:golden`)
- Create: `scripts/golden/capture.mjs`
- Create: `scripts/golden/browser.mjs` (shared launcher)

**Interfaces:**
- Produces: `captureAll(outDir)` writes `<outDir>/<lighting>.png` for all five presets; CLI `node scripts/golden/capture.mjs [outDir]` (default `tests/goldens`). Task 3 imports `browser.mjs`'s `launchDeterministicBrowser()` and `captureAll`.

- [ ] **Step 1: Install dependencies**

```bash
npm install -D playwright ssim.js pngjs @types/pngjs
npx playwright install chromium
```

Add npm scripts:

```json
"golden:capture": "node scripts/golden/capture.mjs",
"test:golden": "node scripts/golden/check.mjs"
```

- [ ] **Step 2: Shared deterministic browser launcher**

Create `scripts/golden/browser.mjs`:

```js
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
```

- [ ] **Step 3: Capture CLI**

Create `scripts/golden/capture.mjs`:

```js
import { captureAll } from "./browser.mjs";

const outDir = process.argv[2] ?? "tests/goldens";
captureAll(outDir).then(
  () => console.log(`goldens written to ${outDir}`),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
```

- [ ] **Step 4: Verify capture works against a running app**

```bash
npm run dev &
sleep 8
node scripts/golden/capture.mjs /tmp/golden-smoke
kill %1
ls -la /tmp/golden-smoke/
```

Expected: five PNGs (`studio.png` … `dramatic.png`), each non-trivially sized (> 20 KB — a black/empty canvas compresses far smaller; if you see tiny files, the canvas captured empty: report BLOCKED with the file sizes rather than proceeding).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/golden/browser.mjs scripts/golden/capture.mjs
git commit -m "feat: deterministic golden-image capture via headless chromium"
```

---

### Task 3: SSIM check script

**Files:**
- Create: `scripts/golden/check.mjs`
- Create: `src/lib/golden/compare-images.ts`
- Test: `src/lib/__tests__/compare-images.test.ts`

**Interfaces:**
- Consumes: `captureAll`, `LIGHTING_IDS` from `scripts/golden/browser.mjs` (Task 2).
- Produces: `compareImages(a: DecodedImage, b: DecodedImage): number` (SSIM 0..1) where `DecodedImage = { data: Uint8ClampedArray; width: number; height: number }`; CLI `node scripts/golden/check.mjs [--self-test]` exiting non-zero on failure.

- [ ] **Step 1: Write the failing test for the pure comparison wrapper**

Create `src/lib/__tests__/compare-images.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareImages, type DecodedImage } from "@/lib/golden/compare-images";

function solid(width: number, height: number, rgba: [number, number, number, number]): DecodedImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3];
  }
  return { data, width, height };
}

describe("compareImages", () => {
  it("identical images → SSIM 1", () => {
    const a = solid(64, 64, [200, 180, 90, 255]);
    expect(compareImages(a, solid(64, 64, [200, 180, 90, 255]))).toBeCloseTo(1, 5);
  });
  it("very different images → low SSIM", () => {
    const a = solid(64, 64, [255, 255, 255, 255]);
    const b = solid(64, 64, [0, 0, 0, 255]);
    expect(compareImages(a, b)).toBeLessThan(0.5);
  });
  it("throws on dimension mismatch", () => {
    expect(() => compareImages(solid(64, 64, [0, 0, 0, 255]), solid(32, 32, [0, 0, 0, 255]))).toThrow(/dimensions/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/compare-images.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the wrapper**

Create `src/lib/golden/compare-images.ts`:

```ts
import ssim from "ssim.js";

export type DecodedImage = { data: Uint8ClampedArray; width: number; height: number };

/** Structural similarity between two same-sized RGBA images, 0..1. */
export function compareImages(a: DecodedImage, b: DecodedImage): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const { mssim } = ssim(
    { data: a.data, width: a.width, height: a.height },
    { data: b.data, width: b.width, height: b.height },
  );
  return mssim;
}
```

If `ssim.js`'s default export shape differs under the project's TS config (it ships CJS), use `import { ssim } from "ssim.js"` or a namespace import — pick whichever satisfies `npx tsc --noEmit`, and quote the final import line in your report.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 23/23 pass (20 + 3 new); no new tsc errors.

- [ ] **Step 5: Check CLI**

Create `scripts/golden/check.mjs`:

```js
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { captureAll, LIGHTING_IDS } from "./browser.mjs";

const THRESHOLD = 0.98;
const GOLDEN_DIR = "tests/goldens";

function decode(file) {
  const png = PNG.sync.read(readFileSync(file));
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

async function compare(file, goldenFile) {
  const { compareImages } = await import("../../src/lib/golden/compare-images.ts");
  return compareImages(decode(file), decode(goldenFile));
}

async function main() {
  if (process.argv.includes("--self-test")) {
    const s = await compare(`${GOLDEN_DIR}/studio.png`, `${GOLDEN_DIR}/dark.png`);
    if (s >= 0.95) throw new Error(`self-test: studio vs dark SSIM ${s.toFixed(4)} — comparator not discriminating`);
    console.log(`self-test ok (studio vs dark SSIM ${s.toFixed(4)})`);
    return;
  }
  const tmp = mkdtempSync(path.join(tmpdir(), "golden-"));
  await captureAll(tmp);
  let failed = false;
  for (const lighting of LIGHTING_IDS) {
    const score = await compare(path.join(tmp, `${lighting}.png`), `${GOLDEN_DIR}/${lighting}.png`);
    const ok = score >= THRESHOLD;
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"} ${lighting}: SSIM ${score.toFixed(4)} (threshold ${THRESHOLD})`);
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Note: importing a `.ts` file from an `.mjs` script requires Node's type-stripping (Node 22.6+ with `--experimental-strip-types`, or Node 23+ default). Check `node --version`; if type-stripping is unavailable, inline the ~15-line `compareImages` logic into `check.mjs` as plain JS (duplicating the tested logic is acceptable here — note it in your report) or add `tsx` as a devDependency and run via `tsx`. State which route you took.

- [ ] **Step 6: Commit**

```bash
git add scripts/golden/check.mjs src/lib/golden/compare-images.ts src/lib/__tests__/compare-images.test.ts
git commit -m "feat: SSIM golden-image check with self-test mode"
```

---

### Task 4: Generate and commit goldens + verify the loop closes

**Files:**
- Create: `tests/goldens/{studio,soft,dark,catalog,dramatic}.png`
- Create: `tests/goldens/README.md`

- [ ] **Step 1: Generate goldens (deterministic environment)**

```bash
npm run dev &
sleep 8
npm run golden:capture
kill %1
ls -la tests/goldens/
```

Expected: five PNGs > 20 KB each.

- [ ] **Step 2: Verify the check passes against fresh captures**

```bash
npm run dev &
sleep 8
npm run test:golden
kill %1
```

Expected: five `PASS <lighting>: SSIM 0.9xxx` lines, exit 0. If any preset scores below threshold on an immediate re-capture, the pipeline is nondeterministic — investigate (autoRotate on? animated postfx?) and fix before committing goldens; report DONE_WITH_CONCERNS if you cannot reach stable ≥0.98 on back-to-back runs.

- [ ] **Step 3: Verify the self-test discriminates**

```bash
node scripts/golden/check.mjs --self-test
```

Expected: `self-test ok (studio vs dark SSIM 0.xxxx)` with score < 0.95.

- [ ] **Step 4: Document regeneration**

Create `tests/goldens/README.md`:

```markdown
# Golden render baselines

Captured via `npm run golden:capture` against `/render-harness` in headless
Chromium + SwiftShader (see `scripts/golden/browser.mjs`). `npm run test:golden`
re-captures and compares with SSIM ≥ 0.98.

Regenerate ONLY when a render change is intentional and visually approved:
1. `npm run dev` (separate terminal)
2. `npm run golden:capture`
3. Eyeball each PNG in `tests/goldens/`
4. Commit the new goldens with the change that caused them.

Never regenerate on a desktop GPU environment — goldens are pinned to the
SwiftShader software renderer for cross-machine consistency.
```

- [ ] **Step 5: Commit**

```bash
git add tests/goldens/
git commit -m "test: commit golden render baselines for 5 lighting presets"
```

---

### Task 5: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx vitest run

  golden:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Build app (harness enabled)
        run: NEXT_PUBLIC_ENABLE_RENDER_HARNESS=1 npm run build
      - name: Start app
        run: |
          npm run start &
          for i in $(seq 1 60); do
            curl -sf http://localhost:3000/render-harness?lighting=studio > /dev/null && break
            sleep 2
          done
      - run: npm run test:golden
      - name: Upload diffs on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: golden-failures
          path: /tmp/golden-*
```

Note: `npx tsc --noEmit` and `npm run lint` are deliberately absent — the repo has 11 pre-existing tsc and 19 lint errors being fixed in a parallel cleanup branch. Add both as CI steps in that branch's PR, not here.

- [ ] **Step 2: Validate YAML locally**

```bash
npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```

Expected: `yaml ok` (or linter pass).

- [ ] **Step 3: Verify the golden job's steps work end-to-end locally** (mirrors CI):

```bash
NEXT_PUBLIC_ENABLE_RENDER_HARNESS=1 npm run build
npm run start &
sleep 10
npm run test:golden
kill %1
```

Expected: five PASS lines, exit 0. This validates the production-build guard allows the harness with the env flag set.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: unit tests + golden-image render benchmark"
```

---

## Done criteria (maps to spec §7 Phase 1 / plan 1B-1 scope)

- Harness renders the reference model through the production viewer pipeline ✅ Task 1
- Deterministic headless capture of all 5 lighting presets ✅ Tasks 2, 4
- SSIM comparison with committed goldens, discriminating self-test ✅ Tasks 3, 4
- CI fails on render-quality regression ✅ Task 5

**Next plan:** 1B-2 — render_credits + render-job queue + Playwright worker + R2 upload (reuses this harness page).
