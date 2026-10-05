# Quality gates

Automated checks keep the feature-driven layout from regressing.

## Frontend

| Check | Command | Notes |
|-------|---------|--------|
| Lint | `npm run lint` | ESLint (complexity / max-lines warnings; fix errors before merge) |
| Types | `npx tsc --noEmit` | Strict TypeScript |
| Import boundaries | `npm run check:boundaries` | Blocks `@/components/viewer` and `@/components/upload` in `src/`, any import of the render harness (`src/features/render/harness/`) outside its route, and the render job's token in page code |
| Unit tests | `npm test` | Vitest |
| Render goldens | `npm run test:golden` | Needs the worker's app (`BUILD_TARGET=worker`) running at `HARNESS_BASE_URL`; see `tests/goldens/README.md` |

## Backend

| Check | Command |
|-------|---------|
| Unit tests | `.venv/bin/python -m pytest -q` (from `backend/`, after `pip install -r requirements-dev.txt`) |
| Syntax | `python3 -m compileall app -q` (from `backend/`) |

## CI

One workflow, `.github/workflows/ci.yml`, runs on every pull request and on pushes to `main`.
Its five checks are required on `main`:

| Check | What it runs |
|-------|--------------|
| `frontend-quality` | Lint, import boundaries, type check |
| `unit` | Vitest and the backend's pytest suite |
| `public-build` | Production build of the app as it ships, and a check that it has no render harness route and no harness code in any chunk (`scripts/ci/check-public-build.mjs`) |
| `golden` | Production build of the render worker's app (`BUILD_TARGET=worker`, which adds the render harness), then the SSIM comparison |
| `dependency-audit` | `npm audit` (production, high and above), `pip-audit` on the backend requirements, and GitHub's dependency review of anything a pull request adds |

A pull request only runs the checks its files need (`scripts/ci/changed-areas.mjs`): docs alone
run nothing, backend changes skip the frontend checks, and only files the render harness can
load (found by following its imports) run the goldens; web changes run the public build. A skipped check counts as passing. Changes to CI or to the lockfile run
everything, and so does every push to `main`.

The workflow reads the repo and nothing else (`permissions: {}`, with `contents: read` per job),
installs dependencies with install scripts off, and pins every action to a commit SHA that
Dependabot keeps current.

## Smoke flow (manual or CI-friendly)

After meaningful changes, verify **upload → dashboard list → viewer → render still**:

1. `POST /api/upload` or dashboard upload → new row in scenes list.
2. Open viewer for that model key; model loads without console errors.
3. Capture still / hires if applicable; `POST /api/renders` (or UI equivalent) returns `ok` and object appears under scene renders.

Document failures with repro steps before merging.
