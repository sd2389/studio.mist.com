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

## Version and fixture pinning

Goldens are also pinned to the exact `playwright` (and bundled Chromium)
version in `package.json` — SwiftShader output can shift between Chromium
builds. After any playwright bump, regenerate and re-approve the goldens.

The model fixture is `public/test-fixtures/PDR-2413.glb`, regenerated from
`samples/PDR-2413.3dm` (not in git) via `npm run golden:fixture` (dev server
required). Regenerating the fixture also requires regenerating the goldens,
since they are pinned to the exact fixture bytes.
