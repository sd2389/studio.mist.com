# Golden render baselines

Captured via `npm run golden:capture` against `/render-harness` in headless
Chromium + SwiftShader (see `scripts/golden/browser.mjs`). `npm run test:golden`
re-captures and compares with SSIM ≥ 0.98. The five lighting setups are captured at once, each
in its own browser, since all pages of one browser share its single SwiftShader GPU process;
`GOLDEN_CONCURRENCY=<n>` runs at most n at a time.

Once the scene has loaded, the harness draws exactly `WARMUP_FRAMES` (24, in
`scripts/golden/browser.mjs`) frames on a fixed clock (frame N at N/60 s), instead of the 60 a
render job draws, then stops drawing and reports ready. A capture depends on neither load speed
nor when the screenshot is taken, so on one machine it is the same PNG byte for byte every run.
Changing that number changes every capture.

Regenerate ONLY when a render change is intentional and visually approved. The safest source
is CI itself: when `golden` fails it uploads its captures as the `golden-failures` artifact,
made on the same runner image as every later check.
1. `gh run download <run id> -n golden-failures`
2. Eyeball each PNG against the old one in `tests/goldens/`
3. Copy them over the old ones and commit them with the change that caused them.

To capture locally instead, start the app (`npm run dev`) and run
`HARNESS_BASE_URL=<its URL> npm run golden:capture`. Local captures can differ slightly from
CI's even on SwiftShader, so prefer CI's. Never regenerate on a desktop GPU.

## Version and fixture pinning

Goldens are also pinned to the exact `playwright` (and bundled Chromium)
version in `package.json` — SwiftShader output can shift between Chromium
builds. After any playwright bump, regenerate and re-approve the goldens.

The model fixture is `public/test-fixtures/PDR-2413.glb`, regenerated from
`samples/PDR-2413.3dm` (not in git) via `npm run golden:fixture` (dev server
required). Regenerating the fixture also requires regenerating the goldens,
since they are pinned to the exact fixture bytes.
