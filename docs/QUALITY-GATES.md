# Quality gates

Automated checks keep the feature-driven layout from regressing.

## Frontend

| Check | Command | Notes |
|-------|---------|--------|
| Lint | `npm run lint` | ESLint (complexity / max-lines warnings; fix errors before merge) |
| Types | `npx tsc --noEmit` | Strict TypeScript |
| Import boundaries | `npm run check:boundaries` | Blocks `@/components/viewer` and `@/components/upload` in `src/` |

## Backend

| Check | Command |
|-------|---------|
| Syntax | `python3 -m compileall app -q` (from `backend/`) |

## Smoke flow (manual or CI-friendly)

After meaningful changes, verify **upload → dashboard list → viewer → render still**:

1. `POST /api/upload` or dashboard upload → new row in scenes list.
2. Open viewer for that model key; model loads without console errors.
3. Capture still / hires if applicable; `POST /api/renders` (or UI equivalent) returns `ok` and object appears under scene renders.

Document failures with repro steps before merging.
