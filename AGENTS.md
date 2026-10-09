# studio.mist.com — agents

**Coding SoT (read first):** [`../AGENTS.md`](../AGENTS.md) · Cursor `../.cursor/rules/mist-workspace.mdc` · [`../CLAUDE.md`](../CLAUDE.md).

**Handoff:** [`../mist-vault/SESSION.md`](../mist-vault/SESSION.md) → [`../mist-vault/BRAIN.md`](../mist-vault/BRAIN.md).

**Contracts:** [`../mist-command-center/docs/design/`](../mist-command-center/docs/design/). Remote: GitHub **`sd2389/studio.mist.com`**.

## Local deltas

### Next.js — read shipped docs

This Next version may differ from training data. Before writing Next code, read guides under `node_modules/next/dist/docs/` and heed deprecation notices.

### Project docs

- Architecture: `docs/ARCHITECTURE.md`
- Code standards: `docs/CODE-STANDARDS.md`
- Feature ownership: `docs/OWNERSHIP.md`
- PR checklist: `docs/REVIEW-CHECKLIST.md`
- Quality gates: `docs/QUALITY-GATES.md`
- Engineering playbook: `docs/ENGINEERING-PLAYBOOK.md`

### Local / Cloud services (typical)

| Service | Port | Notes |
|---------|------|--------|
| PostgreSQL 16 | `5433` | e.g. `studio-postgres`; migrate before backend |
| FastAPI | `8765` | `cd backend && uvicorn app.main:app --reload`; `alembic upgrade head` first |
| Next.js | `3001` | `NEXT_PUBLIC_API_URL=http://localhost:8765 npm run dev` |

- Default `DATABASE_URL` in `backend/app/config.py` → `localhost:5433`.
- `AI_BACKGROUND_MODE` defaults to `stub` (no GPU/SDXL for dev).
- Storage: `STORAGE_BACKEND` / R2 / S3 / local `backend/uploads/`.
- Lint/type from repo root; CI uses `scripts/ci/changed-areas.mjs` — see `docs/QUALITY-GATES.md`.
- After requirements changes: `backend/scripts/lock-requirements.sh` (needs `uv`).
