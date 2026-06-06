# Architecture

Feature-driven layout: **one feature owns its UI, domain logic, and API adapters**. Shared UI primitives stay under `components/ui`. Shared cross-cutting helpers stay under `src/lib` until they belong to a single feature.

## Layers

| Layer | Responsibility |
|-------|----------------|
| **Route / page** | Compose features; no business rules |
| **Feature UI** | Present state; call feature hooks/API |
| **Feature domain** | Rules, transforms, types (pure where possible) |
| **Feature API adapter** | HTTP calls to backend / Next routes |
| **Core / lib** | Storage, env, geometry—used by many features |

## Rules (KISS + SRP)

1. **One function, one job** — parse, validate, transform, persist, and render are separate steps.
2. **KISS** — add abstractions only after the same pattern appears 2–3 times.
3. **Plain names** — prefer `saveSceneToServer` over `persistCtx`.
4. **No domain logic in** `app/api/*` route handlers beyond auth/validation glue.
5. **Feature public API** — import from `@/features/<name>` (barrel `index.ts`), not deep paths into another feature's internals.

## Layout

- `src/features/*` — product features (upload, viewer, scene, render, …)
- `src/components/ui/*` — design system
- `src/lib/*` — shared technical utilities
- `backend/app/features/*` — backend feature services
- `backend/app/core/*` — shared backend infrastructure
- `backend/app/routers/*` — thin HTTP adapters

## Decisions

Record non-obvious structure changes in `docs/adr/` (see template).

Operational quality: [`QUALITY-GATES.md`](QUALITY-GATES.md). Onboarding for new features: [`ENGINEERING-PLAYBOOK.md`](ENGINEERING-PLAYBOOK.md).
