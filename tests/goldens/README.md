# Golden render baselines

Captured via `npm run golden:capture` against `/render-harness` in headless Chromium +
SwiftShader (see `scripts/golden/browser.mjs`). `npm run test:golden` re-captures and compares
with SSIM ≥ 0.98. Every golden is captured at once, each in its own browser, since all pages of
one browser share its single SwiftShader GPU process; `GOLDEN_CONCURRENCY=<n>` runs at most n at
a time.

The harness exists only in the render worker's build of the app (ADR 0005): build and start it
with `BUILD_TARGET=worker`, or run `BUILD_TARGET=worker npm run dev`. The public build has no
`/render-harness` route.

| Golden | What it captures | Backend |
|---|---|---|
| `studio`, `soft`, `dark`, `catalog`, `dramatic` | The harness's golden mode: the live canvas under each lighting setup, screenshotted | WebGL 2 (SwiftShader gives WebGPU no adapter with these flags) |
| `export-still` | The harness's export mode: the job in `fixtures/export-still.json` (a still from a Campaign Pack angle, with a saved look and a CSS gradient backdrop), rendered as the render worker renders it; the golden is the PNG the page hands the sink | WebGL 2 in CI, like the lighting goldens, which its baseline was made on. On Linux, the headless shell's SwiftShader WebGPU lost its device; new headless drew the live stage into a canvas left at 300x150, because a second renderer had got onto it (R3F asked for a renderer on every render until the first was ready; `createR3FWebGPURenderer` now gives a canvas one). Every export capture holds the live renderer's start-up until the catalogue has answered, which provoked that, and the harness fails a job whose live canvas and renderer disagree on its size. The export pipeline is the same on either backend; WebGPU is covered by the render worker's self-check. `GOLDEN_EXPORT_BACKEND=webgpu` runs it on SwiftShader WebGPU instead, and the capture then fails if three.js fell back to WebGL 2 |
| `export-turntable` | The same export mode for a video: the job in `fixtures/export-turntable.json` (12 frames at 160×90 orbiting from the live view, in `export-still`'s look); the golden is the raw frames the page hands the sink, side by side in one strip, frame 0 on the left | As `export-still` |

Once the scene has loaded, the harness draws a fixed number of frames on a fixed clock (frame N
at N/60 s) and stops drawing. The lighting goldens draw `WARMUP_FRAMES` (24, in
`scripts/golden/browser.mjs`) instead of the 60 a render job draws; the export goldens draw the
job's 60. A capture depends on neither load speed nor when the screenshot is taken, so on one
machine it is the same PNG byte for byte every run. Changing those numbers changes every capture.

Regenerate ONLY when a render change is intentional and visually approved. The safest source
is CI itself: when `golden` fails it uploads its captures as the `golden-failures` artifact,
made on the same runner image as every later check. A golden with no baseline yet (a new one)
fails the same way, so it is baselined from CI too.
1. `gh run download <run id> -n golden-failures`
2. Eyeball each PNG against the old one in `tests/goldens/`
3. Copy them over the old ones and commit them with the change that caused them.

To capture locally instead, start the worker app (`BUILD_TARGET=worker npm run dev`) and run
`HARNESS_BASE_URL=<its URL> npm run golden:capture`. Local captures can differ slightly from
CI's even on SwiftShader, so prefer CI's. Never regenerate on a desktop GPU.

## Version and fixture pinning

Goldens are also pinned to the exact `playwright` (and bundled Chromium)
version in `package.json` — SwiftShader output can shift between Chromium
builds. After any playwright bump, regenerate and re-approve the goldens.

The model fixture is `public/test-fixtures/PDR-2413.glb`, regenerated from
`samples/PDR-2413.3dm` (not in git) via `npm run golden:fixture` (dev server
required). Regenerating the fixture also requires regenerating the goldens,
since they are pinned to the exact fixture bytes. The export goldens' jobs are
`fixtures/export-still.json` and `fixtures/export-turntable.json`, in the shape of the API's job
payload (`src/features/render/harness/job-payload.ts`); unit tests keep them readable by the
harness.
