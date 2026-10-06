# MIST Studio

MIST Studio is a jewelry studio that runs in the browser. Upload a CAD file and it opens as a lit 3D scene, with its metals and stones split into slots you can dress. From there you can export stills, turntable video and Campaign Packs, or embed the 3D viewer on a product page, where shoppers see the piece exactly as you finished it. A parametric ring designer outputs STL, OBJ and GLB files. Rendering happens in the browser on WebGPU (WebGL 2 fallback), and gemstones are ray-traced through their facets. A FastAPI service stores accounts, scenes, files and billing in PostgreSQL.

## Features

- **Import:** 10 formats (Rhino 3DM, STEP, IGES, OBJ, FBX, STL, PLY, 3MF, GLB, glTF). Files are converted in the browser, units are normalised to millimetres, and metal and stone layers are detected and named.
- **Stones:** 22 cuts, 74 gem materials and 45 fancy-diamond colours (9 hues × 5 grades), ray-traced with refraction and dispersion at 3, 6 or 9 bounces. A built-in ASET scope shows light return.
- **Materials:** 21 metals (yellow, white, rose and coloured golds from 9K to 24K, platinum, silver, titanium, rhodium black) in 5 finishes. Each slot takes its own material.
- **Scenes:** 8 studio sets and 5 lighting setups, with bloom, star glints, macro depth of field, ambient occlusion and contact shadows.
- **Outputs:** stills at HD, 2K, 4K or 8K (16:9, 1:1, 4:3) as PNG, JPEG or transparent cutouts, and looping H.264 MP4 turntables up to 8K. The Campaign Pack renders stills of every metal from every angle, turntables, a 360° spin with its own viewer, and ASET scopes into one ZIP. AI backgrounds and on-model shots are in beta.
- **Embed:** one iframe puts the live viewer on a store page, view only: the piece shows with the metals, stones, finish, lighting, backdrop and camera view saved in the studio, and shoppers rotate and zoom it. The link is keyed by the piece's SKU and reads the saved scene on every load, so later changes reach snippets already on a store.
- **Ring designer** (`/design`): 9 parametric styles (solitaire, halo, pavé, three-stone, eternity, bezel, band, studs, pendant) with live specs, weight per alloy, a quote from your own metal and labour rates, and STL (per half size), OBJ and GLB downloads.
- **Workspace:** Free, Grow and Studio plans (3 free pieces, 5 GB to 500 GB of storage, 100k to 2M polygons per model), plus credit packs.

## Stack

| Area | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui on Base UI, Zustand |
| 3D | Three.js r184 with React Three Fiber and drei; `WebGPURenderer` with a TSL post-processing pipeline and a TSL gem ray tracer |
| CAD import | rhino3dm (3DM) and occt-import-js (STEP, IGES), both fetched from jsDelivr when first needed; three.js loaders for mesh formats |
| Media | Mediabunny (MP4 muxing), fflate (ZIP) |
| API | FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16, Python 3.12 |
| Storage | Local disk, Cloudflare R2 or Amazon S3 |
| Optional services | Stripe (billing), SMTP (email), Sentry (error reporting) |
| Tests | Vitest, pytest, Playwright render goldens |

Viewing needs a browser with WebGPU or WebGL 2.

Third-party assets and libraries, with their licences and where they are used, are listed in [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md).

## Quick start (Docker)

Requires Docker with Compose v2.

```bash
docker compose up -d
```

Compose builds the images and starts three services, each waiting for the previous one to report healthy:

| Service | Host port | Notes |
|---|---|---|
| `postgres` | 5433 (change with `STUDIO_POSTGRES_PORT`) | Postgres 16; data in the `studio_pg` volume |
| `backend` | 8765 | FastAPI; runs `alembic upgrade head` on every start; uploads in the `studio_uploads` volume |
| `web` | 3000 | Next.js production build |

Open http://localhost:3000. The bundled MIST Solitaire at `/viewer/mist-solitaire` works without an account; you need one to save your own uploads. Interactive API docs are at http://localhost:8765/docs (turned off when `APP_ENV=production`).

Optional seed data:

```bash
docker compose exec backend python -m scripts.seed_catalog     # metals, gems, environments, backdrops, scene presets (idempotent)
docker compose exec backend python -m scripts.fetch_cc0_hdris  # download CC0 HDRIs from Poly Haven
docker compose exec backend python -m scripts.seed_demo_embed  # demo piece, then open /embed/DEMO-EMBED-RING
```

Everyday commands:

```bash
docker compose logs -f backend   # follow logs (also: web, postgres)
docker compose up -d --build     # rebuild after code changes
docker compose down              # stop; data is kept
docker compose down -v           # stop and delete volumes (fresh database)
```

Compose reads variables such as `STUDIO_POSTGRES_PORT`, `NEXT_PUBLIC_API_URL`, `APP_PUBLIC_URL` and `CORS_ORIGINS` from a root `.env`. The backend container receives only the variables listed in `docker-compose.yml`. Add others (storage keys, Stripe, SMTP, `RENDER_WORKER_TOKEN`) in a `docker-compose.override.yml`, which Compose merges automatically and git ignores. `docker-compose.override.example.yml` is the template. Without third-party keys, AI features run in stub mode, emails go to the backend log, and paid checkout is unavailable.

## Local development

**Hybrid:** run the database and API in Docker and Next.js on the host, with hot reload:

```bash
docker compose up -d postgres backend
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8765 npm run dev
```

The dev server's port is set by the `dev` script in `package.json`. If the browser reports CORS errors, set `APP_PUBLIC_URL` to the dev server's origin in `.env` and run `docker compose up -d backend` again. The backend always allows that origin, and it also uses it to build private file links.

**Without Docker:** you need Node.js 22, Python 3.12 and PostgreSQL 16.

1. Start PostgreSQL. The backend's default `DATABASE_URL` points at the Compose database on `localhost:5433`; for any other server, set `DATABASE_URL` in `backend/.env`.
2. Install, migrate and start the API:

   ```bash
   cd backend
   python3.12 -m venv .venv
   .venv/bin/pip install -r requirements-dev.txt
   .venv/bin/alembic upgrade head
   .venv/bin/uvicorn app.main:app --port 8765 --reload
   ```

   No `backend/.env` is needed: storage falls back to `backend/uploads/` and AI runs in stub mode. `backend/.env.example` is set up for R2, so if you copy it, either fill in the `R2_*` keys or set `STORAGE_BACKEND=local`.
3. Start the web app from the repo root: `npm ci`, then `NEXT_PUBLIC_API_URL=http://localhost:8765 npm run dev`. You can also put the variable in `.env.local` (template: `.env.example`). If the browser reports CORS errors, set `APP_PUBLIC_URL` in `backend/.env` to the dev server's origin.

**Schema changes:** Alembic owns the schema (`backend/alembic/versions/`). From `backend/`, run `.venv/bin/alembic revision --autogenerate -m "describe change"`, review the generated file, then `.venv/bin/alembic upgrade head`. Run autogenerate on the host, not with `docker compose exec`: the container has no bind mount, so the new file would stay inside it. Under Compose, rebuild the backend (`docker compose up -d --build backend`) so the container gets the new migration.

## Environment variables

Templates: [`.env.example`](.env.example) (web, Compose) and [`backend/.env.example`](backend/.env.example) (API). Never commit real values.

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | web, build time | FastAPI URL the browser calls |
| `API_URL` | web, server | FastAPI URL for Next.js route handlers; Compose points it at the internal `backend` service |
| `NEXT_PUBLIC_CDN_ORIGIN` | web, build time | Load models, thumbnails and renders from a CDN |
| `NEXT_PUBLIC_SOURCE_ASSET_ORIGIN` | web, build time | Separate origin for catalogue HDRIs and backgrounds |
| `BUILD_TARGET` | web, build and start | `worker` makes the render worker's app, which adds `/render-harness`; any other build, dev servers included, has no such route |
| `NEXT_PUBLIC_SENTRY_*`, `SENTRY_*` | web, backend | Optional Sentry reporting and source-map upload |
| `STUDIO_POSTGRES_PORT` | Compose | Host port for Postgres |
| `DATABASE_URL` | backend | Postgres connection; must be set when `APP_ENV=production` |
| `APP_ENV` | backend | `production` turns off `/docs`, requires `DATABASE_URL` and gates `/health/deps` |
| `APP_PUBLIC_URL` | backend | Browser-facing web origin for private file links, email links and Stripe redirects; always allowed by CORS |
| `CORS_ORIGINS`, `CORS_ORIGIN_REGEX` | backend | Extra browser origins allowed to call the API |
| `PUBLIC_API_BASE`, `PUBLIC_CDN_ORIGIN` | backend | Absolute bases for file URLs in API responses |
| `STORAGE_BACKEND` | backend | `local`, `r2` or `s3`; unset or `auto` picks R2 when its keys are set, then S3 when `AWS_BUCKET` is set, else `backend/uploads/` |
| `R2_*` | backend | Cloudflare R2 account, keys, private and public buckets, endpoint and public base URL |
| `AWS_*` | backend | Amazon S3 or another S3-compatible store |
| `MAX_UPLOAD_BYTES`, `RATE_LIMIT_*` | backend | Upload size cap; hourly limits on uploads and AI backgrounds, counted in the database so every API process shares them |
| `AI_BACKGROUND_MODE` | backend | AI backgrounds: `off`, `stub` (no GPU) or `sdxl` (GPU host, optional packages) |
| `AI_ON_MODEL_PROVIDER`, `REPLICATE_API_TOKEN` | backend | On-model shots: `stub`, `sdxl` or `replicate` |
| `EMAIL_FROM`, `CONTACT_NOTIFY_EMAIL`, `SMTP_*` | backend | Password-reset and contact-form email; without `SMTP_HOST`, emails go to the log |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | backend | Plan subscriptions and top-up packs |
| `ADMIN_EMAILS` | backend | Comma-separated email addresses that get admin access |
| `DEMO_EMBED_PASSWORD` | backend | Password for the embed demo's owner account; unset, the seed gives it a random one |
| `HEALTH_DEPS_TOKEN` | backend | `X-Health-Token` value for `GET /health/deps` in production |
| `INTERNAL_PROXY_TOKEN` | web, backend | Shared secret, the same on both: the web server's sign-in and sign-up proxies send it with the caller's IP, and the API believes a forwarded IP only with it (never a bare `X-Forwarded-For`). Unset, sign-ins through the web app share one per-IP budget, and the API warns at startup in production |
| `RENDER_WORKER_TOKEN` | backend, worker | Shared secret for render workers, or several comma-separated while one is rotated in; the job-claim endpoint returns 503 until it is set |
| `RENDER_API_URL` | worker | Backend URL |
| `HARNESS_BASE_URL` | worker, goldens | URL of the worker's app (`BUILD_TARGET=worker`), which serves `/render-harness` |

## Deploying

- **Database:** use a managed PostgreSQL, set `DATABASE_URL`, and run `alembic upgrade head` on deploy (the backend image does this on start). The Compose database is for development.
- **Storage:** set `STORAGE_BACKEND` plus the `R2_*` or `AWS_*` variables on the backend. Uploads are presigned and registered through FastAPI, so the web app holds no storage keys. For R2, `python -m scripts.setup_r2` (from `backend/`) creates the private and public buckets and sets CORS on the private one from `CORS_ORIGINS` and `APP_PUBLIC_URL`. For S3, start from `scripts/s3-cors.example.json`.
- **Files:** private models and renders load through the signed-in `/api/files/...` route, while published SKU models keep public URLs. Stored objects get `Cache-Control` by key prefix (`backend/app/core/cache_policy.py`). With a CDN, set `PUBLIC_CDN_ORIGIN` (backend) and `NEXT_PUBLIC_CDN_ORIGIN` (web build).
- **Proxy token:** set `INTERNAL_PROXY_TOKEN` to the same random value on the web app and the backend (e.g. `openssl rand -hex 32`), so the API rate-limits sign-ins per caller rather than per web server.
- **Origins:** set `APP_PUBLIC_URL`, `NEXT_PUBLIC_API_URL`, `PUBLIC_API_BASE` and `CORS_ORIGINS` to the public origins and keep `API_URL` internal. `NEXT_PUBLIC_*` values are compiled into the bundle, so rebuild the web image after changing them.
- **Catalogue:** after deploying, run `python -m scripts.seed_catalog` and `python -m scripts.fetch_cc0_hdris` from `backend/`.

## Billing operations

The Stripe webhook records each paid top-up in `credit_purchases` (one row per Checkout Session) in the same commit that adds the credits. The admin user detail API lists a user's latest purchases as `recent_purchases`.

Top-up credits, and a plan bought at checkout, are granted only once the Checkout Session is paid. A delayed payment method completes the checkout unpaid and is granted on `checkout.session.async_payment_succeeded`; `checkout.session.async_payment_failed` grants nothing. The Stripe webhook endpoint must send both of those events as well as `checkout.session.completed`.

`python -m scripts.reset_free_ai_credits` (from `backend/`) lowers Free accounts that hold more AI image credits than the Free allowance in `plans.py` (Free used to get 150). Each account keeps the allowance plus the AI credits it paid for, from the purchase ledger and from paid Stripe Checkout Sessions, plus positive admin AI adjustments. No balance goes up, and Grow and Studio accounts are left alone.

- It is a dry run by default: it prints each account's user id, plan, current, paid, granted and new balance, with totals, and changes nothing.
- `--apply --admin-id <id>` writes the new balances and one `credit_adjustments` row per lowered account (kind `free_ai_allowance_reset`), recorded under that admin.
- It needs `STRIPE_SECRET_KEY` to find top-ups bought before the ledger existed, and refuses to run without it unless you pass `--no-stripe`, which counts only the ledger and admin grants.

## Server renders (optional)

Exports render on GPU workers ([ADR 0005](docs/adr/0005-server-exports.md)). Creating a job (`POST /render-jobs`) holds its render credits; a worker claims it, renders it in the harness and uploads the files, and completing the job charges the credits it held. A job that ends failed or canceled is refunded. The worker protocol, under `/render-jobs`:

- `POST /claim`, with `X-Worker-Token` and `{"worker_id", "kinds"}`, answers the next job of those kinds: the highest priority, then the oldest, whose retry backoff has passed and whose owner runs fewer jobs than their plan allows. It carries a fresh job token and a lease of `RENDER_JOB_LEASE_SECONDS` (120 by default). `RENDER_WORKER_TOKEN` may list several tokens, comma-separated, so one can be rotated in.
- Every other call takes only the job token, in the `X-Job-Token` header, never in a URL: `GET /{id}/payload` (the spec, the look and its catalogue items, the model, the watermark, the limits), `POST /{id}/heartbeat` every 20 s, `POST /{id}/uploads` (signed PUTs with each file's size and name signed in), `POST /{id}/complete` and `POST /{id}/fail` (`{error, code, retryable}`).
- A heartbeat extends the lease until the job's kind has run out of run time, and answers `cancel` when the owner canceled the job or the time is up. A job whose lease runs out is taken back by the next claim as a failed attempt, and its old token stops working.
- A retryable failure is queued again after 30 s, then 60 s; after 3 attempts, or on a final code, the job fails and is refunded.
- The job's spec names its files in `output_names`: a still's or an angle set's images, one per camera; a turntable's one H.264 MP4 (`video/mp4`, at most 4 GB), which the worker encodes from the `frames` the harness renders; a spin's one ZIP (`application/zip`, under 4 GB, no ZIP64) of its frames and `spin.html`. An MP4 or a ZIP is reported with its frames' width and height.
- Outputs live under `customers/<user>/renders/<job>/`. `complete` checks each file's key, type and stored size against the job, then creates the scene's renders, charges the credits and counts the bytes toward the owner's storage, which deleting the scene gives back.
- Local storage signs nothing, so there the payload names `GET /{id}/inputs/model` and `/inputs/background`, and uploads go to `PUT /{id}/uploads/{name}`, all with the job token.

The page that renders jobs is only in the render worker's build of the app: `BUILD_TARGET=worker` (for `npm run build`, `npm run start` and `npm run dev` alike) adds `/render-harness`, which the public build does not have. The worker opens it in headless Chromium on loopback. `?mode=probe` reports whether three.js draws with WebGPU or WebGL 2 there, and `?mode=export` renders the job the worker hands the page in `window.__RENDER_JOB__`, sending what it renders to the worker's loopback sink: a still or an angle set (a live view, a saved pose or a Campaign Pack angle) as image files; a turntable (an orbit from a camera, or a cut through saved poses, moved exactly as the studio's video export moves it) as raw RGBA frames, in order, for the worker to encode; a spin (the Campaign Pack's spin orbit) as image files plus the pack's `spin.html` viewer, for the worker to zip. The worker process itself (`npm run worker:render`) is being rebuilt around that mode and this protocol (ADR 0005, A4) and refuses to start until then; `npm run test:golden` drives the export mode with a fixture job.

To try the API locally, `cp docker-compose.override.example.yml docker-compose.override.yml` gives the backend a `RENDER_WORKER_TOKEN`, and `docker compose exec backend python -m scripts.seed_smoke_job` queues a still for a smoke-test user (`--bogus`: one whose model file is missing).

Only a claim takes back a job whose lease ran out, so with no worker polling it stays `running`.

## Project layout

| Path | Contents |
|---|---|
| `src/app/` | Next.js routes: marketing pages, studio (`/viewer`), designer (`/design`), embed (`/embed`), dashboard, admin; `api/` handlers forward to FastAPI |
| `src/features/` | Feature slices (upload, viewer, editor, scene, render, ring-builder, scene-setups, billing, auth, admin, and more), each owning its UI, domain logic and API calls |
| `src/components/` | Shared UI: `ui/` design system, `site/` and `scroll-film/` marketing shell and home film, embed and dashboard pieces |
| `src/lib/` | Shared modules: `convert/` CAD import, `gem-gpu/` gem ray tracer, `gpu/` renderer setup, `jewelry-cad/` and `stones/` ring kernel and cuts, `pricing/` |
| `src/stores/` | Zustand stores |
| `backend/app/` | FastAPI: thin `routers/`, `features/` services, `core/` storage, URLs and security, `models/` SQLAlchemy |
| `backend/alembic/` | Database migrations |
| `backend/scripts/` | Seed and maintenance commands (catalogue, HDRIs, demo embed, render smoke job, R2 setup, Free AI credit reset) |
| `backend/tests/` | pytest suite |
| `public/` | Static assets: bundled models, HDRIs, feature-page images, test fixtures |
| `scripts/` | Import-boundary check, golden capture and check, render worker |
| `tests/goldens/` | Baseline renders for the golden check |
| `samples/` | Local CAD test files (git-ignored) |
| `docs/` | Architecture, standards, ownership, quality gates, ADRs |

## Tests and quality gates

```bash
npm run lint               # ESLint
npx tsc --noEmit           # type check
npm run check:boundaries   # fails on the removed @/components/viewer and upload paths, and on render harness imports outside its route
npm test                   # Vitest unit tests (src/**/*.test.ts, *.test.tsx)
npm run build              # production build
```

Backend dependencies: `backend/requirements.txt` holds version ranges; the Docker image and CI install the hash-pinned `requirements.lock` and `requirements-dev.lock` (Linux, Python 3.12). After changing a requirements file, regenerate both with `backend/scripts/lock-requirements.sh` (needs [uv](https://docs.astral.sh/uv/)).

Backend, from `backend/` with the virtualenv above:

```bash
.venv/bin/python -m pytest              # in-memory SQLite; no running Postgres needed
.venv/bin/python -m compileall app -q   # syntax gate
```

**Render goldens** (`npm run test:golden`):

- Captures `/render-harness` in headless Chromium with the SwiftShader software renderer, all at once with one browser each: the live view under the 5 lighting setups, and a still and a 12-frame turntable strip rendered by the export mode from fixture jobs; all on WebGL 2, or the export ones on WebGPU with `GOLDEN_EXPORT_BACKEND=webgpu`. Compares each image with `tests/goldens/` (SSIM 0.98 or higher).
- Needs Playwright's Chromium (`npx playwright install chromium`) and the worker's app running at `HARNESS_BASE_URL` (default `http://localhost:3000`). That can be `BUILD_TARGET=worker npm run dev`, or a production build and start with `BUILD_TARGET=worker` on both, which is what CI does.
- Goldens are pinned to SwiftShader, the Playwright version in `package.json` and the fixture model. Regenerate them only for an approved render change, following [tests/goldens/README.md](tests/goldens/README.md).

After meaningful changes, also run the manual smoke flow in [docs/QUALITY-GATES.md](docs/QUALITY-GATES.md) (upload, dashboard list, viewer, render still).

CI runs lint, type checks, unit tests, render goldens and a dependency audit on every pull request.

## Contributing

- Read [docs/ENGINEERING-PLAYBOOK.md](docs/ENGINEERING-PLAYBOOK.md) before adding a feature. The rules are in [ARCHITECTURE.md](docs/ARCHITECTURE.md), [CODE-STANDARDS.md](docs/CODE-STANDARDS.md) and [OWNERSHIP.md](docs/OWNERSHIP.md).
- Open pull requests into `main`. They are squash-merged.
- Run the quality gates above and go through [REVIEW-CHECKLIST.md](docs/REVIEW-CHECKLIST.md). Record structural changes as an ADR in [docs/adr/](docs/adr/). Earlier decisions are in [DECISIONS.md](docs/DECISIONS.md).
