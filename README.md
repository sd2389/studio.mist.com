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
See [`docs/`](docs/) — architecture, ownership, quality gates, and [DECISIONS.md](docs/DECISIONS.md).

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

Possible but more work. See `docs/ARCHITECTURE.md` for the hybrid dev layout.

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

### Production storage + CDN
1. Create an S3 or Cloudflare R2 bucket; enable CORS for `PUT` from your app origin.
2. Set `AWS_BUCKET`, credentials, and (for R2) `AWS_S3_ENDPOINT` + `AWS_S3_FORCE_PATH_STYLE=true` on **backend** and **web** (presign route).
3. Point a CDN at the bucket; set `PUBLIC_CDN_ORIGIN` (backend) and `NEXT_PUBLIC_CDN_ORIGIN` (web build).
4. Optional: serve catalog HDRIs from a dedicated static origin via `NEXT_PUBLIC_SOURCE_ASSET_ORIGIN`.
5. Sync CC0 HDRIs after deploy: `docker compose exec backend python -m scripts.fetch_cc0_hdris`.
6. Uploads set `Cache-Control` per key prefix (`models/` immutable 1y, `thumbnails/` 1d, `catalog/` 7d).

---

## Server renders (render-job service)

Full-fidelity server-side renders are produced by a Node worker that drives a
headless Playwright browser through the same Three.js pipeline used in the live
viewer.  The browser renders 60 warm-up frames then captures the scene at the
requested resolution via `renderAtResolution`.

### Credits model

Each successful render consumes exactly **1 render credit** from the job owner's
`UserBilling.render_credits_balance`.  Credits are debited only on success — a
failed or retried job never touches the balance.  Plans ship with a default
allotment; top-up packs are a Phase 3 item.

**Caveat (v1 accepted):** The completion path commits the credit debit and the
job-state update in a single DB transaction, but the PNG is written to storage
*before* that commit.  A crash between the storage write and the commit would
leave the credit consumed but the job still marked "running" — the operator
would need to manually reset or re-run.  A single-worker deployment makes this
window very small and was accepted for v1.

### Running the worker locally

Prerequisites: `docker compose up -d postgres backend` (with `RENDER_WORKER_TOKEN`
set in the backend — see `docker-compose.override.yml` below) and
`npm run dev` running on the host.

```bash
# 1. Add RENDER_WORKER_TOKEN to the backend (docker-compose.override.yml):
#    services:
#      backend:
#        environment:
#          RENDER_WORKER_TOKEN: smoketoken

# 2. Seed a smoke job (creates or reuses smoke@devjewels.test with 5 render credits):
docker compose exec backend python -m scripts.seed_smoke_job

# 3. Run the worker (one job then exit):
RENDER_WORKER_TOKEN=smoketoken RENDER_API_URL=http://localhost:8765 \
  npm run worker:render -- --once

# 4. Verify: check job status + balance in the container:
docker compose exec backend python -c "
from app.database import SessionLocal
from sqlalchemy import select, text
with SessionLocal() as db:
    rows = db.execute(text('SELECT id,status,result_key,attempts FROM render_jobs ORDER BY id DESC LIMIT 3')).fetchall()
    for r in rows: print(r)
"
```

To test the failure path (bogus model URL → 3 retries → failed, no credit charge):

```bash
docker compose exec backend python -m scripts.seed_smoke_job --bogus
# Then run worker --once three times; last run shows status=failed, credits unchanged.
```

### Worker env vars

| Var | Default | Purpose |
|---|---|---|
| `RENDER_WORKER_TOKEN` | — | **Required** — shared secret; must match backend `RENDER_WORKER_TOKEN` |
| `RENDER_API_URL` | `http://localhost:8765` | Backend base URL |
| `HARNESS_BASE_URL` | `http://localhost:3000` | Next.js app URL (set via `BASE_URL` in `browser.mjs`) |

**Security caveat (v1 accepted):** Per-job page tokens (`worker_token`) appear in
access logs as query-string parameters on the `/payload`, `/complete`, and `/fail`
endpoints.  Tokens are single-use UUID hex values (128 bits) and expire with the
job, so log exposure is low risk.  A header-based token scheme is the Phase 2
hardening path.

### GPU / serverless deploy

Cloud GPU and serverless deployment (Runpod, Modal, Vast.ai) land in **Phase 3**.
The worker is a plain Node process — it only needs `playwright` and a Chromium
install.  Point `RENDER_API_URL` at the production backend and set
`HARNESS_BASE_URL` to the production app URL.

---

## Env vars

| Var | Where | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | backend | `postgresql+psycopg2://studio:studio@postgres:5432/studio` | Postgres connection |
| `NEXT_PUBLIC_API_URL` | web (build-time) | `http://localhost:8765` | Browser → FastAPI |
| `API_URL` | web (runtime) | `http://backend:8765` | Server-side proxy → FastAPI over internal Docker network |
| `AWS_BUCKET` / `AWS_REGION` | backend + web | — | S3 or R2 for GLB, thumbnails, renders |
| `AWS_S3_ENDPOINT` / `AWS_S3_FORCE_PATH_STYLE` | backend + web | — | Cloudflare R2 (or other S3-compatible) |
| `PUBLIC_CDN_ORIGIN` | backend | — | CDN base for `model_url` / `thumbnail_url` in API responses |
| `NEXT_PUBLIC_CDN_ORIGIN` | web (build-time) | — | Browser loads GLB/thumbnails directly from CDN |
| `NEXT_PUBLIC_SOURCE_ASSET_ORIGIN` | web (build-time) | — | Clean-room HDRIs/catalog assets (optional separate origin) |
| `AI_BACKGROUND_MODE` | backend | `stub` | `off` / `stub` / `sdxl` (GPU host required) |
| `PUBLIC_API_BASE` | backend | `http://localhost:8765` | Absolute base for `result_url` in AI BG responses |
| `CORS_ORIGINS` | backend | `localhost:3000,127.0.0.1:3000` | Comma-separated CORS allowlist |
| `RENDER_WORKER_TOKEN` | backend | — | Shared secret for render worker auth (`POST /render-jobs/claim`) |
