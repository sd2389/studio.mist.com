# Code standards

## Complexity

- Prefer **cyclomatic complexity ≤ 15** per function (ESLint warns above 20).
- If a file exceeds **~400 lines** and mixes concerns, split by responsibility.

## Naming

- Use **verb + noun** for actions: `loadScene`, `normalizeSlotId`.
- Avoid vague names: `data`, `temp`, `helper`, `stuff`, `handleThing`.
- Booleans: `is…`, `has…`, `should…`.

## React

- Components **orchestrate**; hooks and pure helpers hold logic.
- Side effects belong in `useEffect` or explicit event handlers—not random renders.

## Python

- Routers **delegate** to `features/*/service.py`.
- One module class of reasons to change per file.

## Reviews

Use `docs/REVIEW-CHECKLIST.md` before merging structural changes.
