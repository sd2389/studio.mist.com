# Engineering playbook — adding a feature

Use this when introducing a new product capability end-to-end.

## 1. Name and scope

- Pick a **business noun** for the folder (`billing`, `variants`, …).
- One feature = one reason to change (avoid “misc” buckets).

## 2. Frontend (`src/features/<name>/`)

1. Create `src/features/<name>/index.ts` — **only** exports callers outside the feature may use.
2. Add subfolders as needed:
   - `ui/` — React components
   - `domain/` — pure helpers, types (optional)
   - Re-export API adapters from `lib/` only if this feature owns that HTTP surface.
3. Import rule: pages and **other features** use `@/features/<name>` — never deep-import another feature’s internals.

## 3. Backend (`backend/app/features/<name>/`)

1. Add `service.py` (use-cases), optional `repo.py` / `domain/` if persistence or rules grow.
2. Keep `backend/app/routers/*.py` **thin**: parse HTTP → call service → map response.
3. Shared IO (S3, paths, URLs) belongs in `backend/app/core/` — not duplicated in routers.

## 4. Quality bar before merge

- `npm run lint` and `npx tsc --noEmit`
- `npm run check:boundaries`
- From `backend/`: `python3 -m compileall app -q`
- See [`QUALITY-GATES.md`](QUALITY-GATES.md) for smoke flow.

## 5. Document surprises

If structure differs from above, add a short ADR under `docs/adr/` (template in `0000-template.md`).
