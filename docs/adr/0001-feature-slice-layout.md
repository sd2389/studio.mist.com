# ADR 0001: Feature slice layout (frontend + backend)

## Status

Accepted

## Context

Surface-based folders (`components/viewer`, `components/upload`) mixed many reasons to change and made ownership unclear.

## Decision

- Frontend: product code under `src/features/<name>/` with a public `index.ts`.
- Backend: orchestration under `backend/app/features/<name>/`; shared I/O under `backend/app/core/`.
- Routers remain HTTP adapters that call feature services.

## Consequences

- Clearer ownership and imports via barrels.
- Small churn during migration; old paths removed after cutover.

## Rollback

Revert feature folders and restore imports to `components/*`.
