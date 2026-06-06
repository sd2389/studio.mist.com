<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project conventions

- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Code standards (KISS / SRP): [`docs/CODE-STANDARDS.md`](docs/CODE-STANDARDS.md)
- Feature ownership: [`docs/OWNERSHIP.md`](docs/OWNERSHIP.md)
- PR checklist: [`docs/REVIEW-CHECKLIST.md`](docs/REVIEW-CHECKLIST.md)
- Quality gates & smoke: [`docs/QUALITY-GATES.md`](docs/QUALITY-GATES.md)
- How to add a feature: [`docs/ENGINEERING-PLAYBOOK.md`](docs/ENGINEERING-PLAYBOOK.md)

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port | Notes |
|---|---|---|---|
| PostgreSQL 16 | `docker run -d --name studio-postgres -p 5433:5432 -e POSTGRES_USER=studio -e POSTGRES_PASSWORD=studio -e POSTGRES_DB=studio postgres:16-alpine` | 5433 | Must be running before backend starts |
| FastAPI backend | `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload` | 8765 | Run Alembic migrations first: `cd backend && alembic upgrade head` |
| Next.js frontend | `NEXT_PUBLIC_API_URL=http://localhost:8765 npm run dev` | 3000 | Set env var so browser hits backend directly |

### Startup order

1. Start Docker daemon: `sudo dockerd &>/tmp/dockerd.log &` (wait ~5s).
2. Start PostgreSQL container (see table above). Wait until `docker exec studio-postgres pg_isready -U studio -d studio` returns success.
3. Run Alembic migrations: `cd /workspace/backend && alembic upgrade head`.
4. Start backend in a tmux session (see table).
5. Start frontend in a separate tmux session (see table).

### Gotchas

- The backend default `DATABASE_URL` in `backend/app/config.py` already points to `localhost:5433` — no env override needed for local dev.
- `pip install` puts scripts (`alembic`, `uvicorn`, `celery`) into `~/.local/bin`, which may not be on `PATH`. Run `export PATH="$HOME/.local/bin:$PATH"` or add it to `~/.bashrc`.
- Docker in the Cloud VM requires `fuse-overlayfs` storage driver and `iptables-legacy`. See the environment setup for details.
- ESLint (`npx eslint .`) and TypeScript (`npx tsc --noEmit`) run from the repo root. Pre-existing lint warnings/errors exist in the codebase.
- `AI_BACKGROUND_MODE` defaults to `stub` — no GPU or SDXL deps needed for dev.
- AWS S3 is optional; without `AWS_BUCKET` set, uploads go to `backend/uploads/` on the local filesystem.
- Lint: `npm run lint` (alias for `eslint`). Build: `npm run build`. See `package.json` scripts.
- Backend tests: `cd backend && .venv/bin/python -m pytest`. Frontend has no test runner configured.
