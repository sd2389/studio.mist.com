# DevJewels Studio

Browser-based jewelry rendering studio. CAD upload → photoreal renders → 360 video → embed.

## Stack
- Next.js 16 (App Router) + React 19, Three.js r184 (R3F + drei + postprocessing)
- Zustand + Tailwind v4 + shadcn
- FastAPI + SQLAlchemy + **PostgreSQL 16** (Alembic migrations)
- Mediabunny for MP4 muxing
- S3 for model + render storage
- **Dockerized** — one command starts everything

## Project docs
Living docs in [`../vault/`](../vault/). Start with [`../vault/README.md`](../vault/README.md).

---

## Run — full Docker (recommended)

Prereq: Docker + Docker Compose v2.

```bash
docker compose up -d
```

That's it. 3 containers come up in order:
1. `postgres` — Postgres 16, persistent volume `studio_pg`, exposed on `localhost:5433`
2. `backend` — FastAPI on `localhost:8765`, runs `alembic upgrade head` on every boot
3. `web` — Next.js production build on `localhost:3000`

Open http://localhost:3000.

Total memory: ~200 MB across all 3 containers (vs ~1–2 GB for `npm run dev` on the host).

### Common commands
```bash
docker compose ps                 # status
docker compose logs -f backend    # tail logs
docker compose logs -f web
docker compose restart backend    # restart one service
docker compose down               # stop (data persists)
docker compose down -v            # stop + nuke volumes (fresh DB)
```

### Update code → rebuild
```bash
docker compose up -d --build              # rebuild any changed service
docker compose build backend && docker compose up -d backend   # rebuild only backend
```

---

## Run — hybrid (fast edit loop)

For active coding, run only Postgres + backend in Docker and Next dev on the host (instant HMR):

```bash
docker compose up postgres backend -d
NEXT_PUBLIC_API_URL=http://localhost:8765 npm run dev
```

The host dev server hot-reloads on save; backend + DB stay isolated.

---

## Run — bare metal (no Docker)

Possible but more work. See `vault/` if you really want this path.

---

## Database

Postgres-only. Schema lives in `backend/alembic/versions/`.

### Change schema
```bash
docker compose exec backend alembic revision --autogenerate -m "describe change"
docker compose restart backend     # boot reapplies migrations
```

Edit the generated file under `backend/alembic/versions/` before committing.

### Reset DB (dev only)
```bash
docker compose down -v && docker compose up -d
```

### Production
Set `DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/dbname` and run `alembic upgrade head` on deploy. Compose-managed Postgres is dev-only — use managed Postgres (Neon, Supabase, RDS) in prod.

---

## Env vars

| Var | Where | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | backend | `postgresql+psycopg2://studio:studio@postgres:5432/studio` | Postgres connection |
| `NEXT_PUBLIC_API_URL` | web (build-time) | `http://localhost:8765` | Browser → FastAPI |
| `API_URL` | web (runtime) | `http://backend:8765` | Server-side proxy → FastAPI over internal Docker network |
| `AWS_BUCKET` / `AWS_REGION` | backend | — | S3 for model + render storage |
| `AI_BACKGROUND_MODE` | backend | `stub` | `off` / `stub` / `sdxl` (GPU host required) |
| `PUBLIC_API_BASE` | backend | `http://localhost:8765` | Absolute base for `result_url` in AI BG responses |
| `CORS_ORIGINS` | backend | `localhost:3000,127.0.0.1:3000` | Comma-separated CORS allowlist |
