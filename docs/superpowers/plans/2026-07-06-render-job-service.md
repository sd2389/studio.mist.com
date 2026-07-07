# Render-Job Service Implementation Plan (Phase 1B-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-side render exports: a quota-metered job queue (`render_credits`), worker endpoints, a harness job-mode that renders through the production full-fidelity pipeline, and a Playwright worker — so exports never depend on customer hardware.

**Architecture:** FastAPI gains a `render_jobs` feature (queued → running → completed/failed, retry ≤3, credits consumed only on success). A Node+Playwright worker claims jobs over HTTP (shared-secret header), drives `/render-harness?job=<id>&token=<t>`; the page fetches the job payload, mounts the production `ViewerCanvas` (whose `HiresExportBridge`/`RenderFidelityBridge` at ViewerCanvas.tsx:200-203 expose `getHiresRefs()`/`getRenderFidelity()`), renders offscreen via `renderAtResolution`, and uploads the PNG straight to the backend complete endpoint. Serverless-GPU deployment of the same worker is Phase 3; locally it runs on SwiftShader.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic, existing quota/storage/core patterns, Next.js harness page, Playwright script worker, pytest (backend/tests exists — mirror `test_billing_quota.py`).

## Global Constraints

- Backend patterns are law: models use `Mapped`/`mapped_column` with `Base` from `app.models.scene`; routers thin, logic in `backend/app/features/<name>/service.py`; schemas in `backend/app/schemas/`; migration via `docker compose exec backend alembic revision --autogenerate -m "..."` then hand-edit; router mounted in `backend/app/routers/__init__.py`.
- Quota law: `assert_render_credit(db, user)` at job creation (402 if none — message style mirrors `assert_ai_image_credit`), `consume_render_credit(db, billing)` ONLY on successful completion. Failed jobs never charge.
- Plan quota values: free **25**, grow **300**, studio **1500** `render_credits` per period.
- Job states: `queued | running | completed | failed`. Max attempts **3**; a `fail` on attempt <3 requeues, on attempt 3 marks `failed`.
- Worker auth: header `X-Worker-Token` must equal `settings.render_worker_token` (new Settings field, env `RENDER_WORKER_TOKEN`; endpoints return 503 if unset). Per-job page auth: `worker_token` column (uuid4 hex), checked on payload/complete/fail.
- Width/height clamp: `min(requested, plan max_image_resolution)` from the user's billing features snapshot; default 2048×2048; format `png` only in v1.
- Frontend: TS strict, no `any`/`@ts-ignore`; do not modify `src/features/render/` (invariant test).
- All commands from repo root; backend commands via `docker compose exec backend ...` (compose postgres on 5433, backend on 8765).
- TSC baseline: 12 pre-existing errors in 5 known files; new code adds none. Vitest baseline 23/23; backend pytest baseline: run once before starting, record count, keep green.

---

### Task 1: `render_credits` quota kind

**Files:**
- Modify: `backend/app/features/billing/plans.py` (PlanQuotas field + 3 values)
- Modify: `backend/app/models/billing.py` (column `render_credits_balance`)
- Modify: `backend/app/features/billing/quota_service.py` (allotment application + assert/consume)
- Create: migration via autogenerate
- Test: `backend/tests/test_render_credits.py`

**Interfaces:**
- Produces: `assert_render_credit(db: Session, user: User) -> UserBilling`; `consume_render_credit(db: Session, billing: UserBilling) -> None` — consumed by Tasks 3–4.

- [ ] **Step 1: Read the mirrors** — `backend/tests/test_billing_quota.py` (test style + fixtures from `conftest.py`) and the `ai_image_credits` triple: `plans.py` `PlanQuotas.ai_image_credits`, `models/billing.py` `ai_image_credits_balance`, `quota_service.py` `assert_ai_image_credit`/`consume_ai_image_credit` and `_apply_allotment`.

- [ ] **Step 2: Write the failing tests** — `backend/tests/test_render_credits.py`, mirroring `test_billing_quota.py`'s fixture usage:

```python
import pytest
from fastapi import HTTPException

from app.features.billing.plans import PLAN_QUOTAS
from app.features.billing.quota_service import (
    assert_render_credit,
    consume_render_credit,
    get_or_create_billing,
)


def test_plan_quotas_define_render_credits():
    assert PLAN_QUOTAS["free"].render_credits == 25
    assert PLAN_QUOTAS["grow"].render_credits == 300
    assert PLAN_QUOTAS["studio"].render_credits == 1500


def test_assert_render_credit_passes_with_balance(db, user):
    billing = get_or_create_billing(db, user)
    billing.render_credits_balance = 1
    db.commit()
    assert assert_render_credit(db, user) is billing


def test_assert_render_credit_402_when_empty(db, user):
    billing = get_or_create_billing(db, user)
    billing.render_credits_balance = 0
    db.commit()
    with pytest.raises(HTTPException) as exc:
        assert_render_credit(db, user)
    assert exc.value.status_code == 402


def test_consume_render_credit_decrements(db, user):
    billing = get_or_create_billing(db, user)
    billing.render_credits_balance = 2
    db.commit()
    consume_render_credit(db, billing)
    assert billing.render_credits_balance == 1
```

Adapt fixture names (`db`, `user`) to whatever `conftest.py` actually provides — quote the fixtures you used in your report.

- [ ] **Step 3: Run to verify failure** — `docker compose exec backend pytest tests/test_render_credits.py -v` → FAIL (no `render_credits` field).

- [ ] **Step 4: Implement** — add `render_credits: int` to `PlanQuotas` and the three values (free 25, grow 300, studio 1500 — every existing tier entry must gain the field); add `render_credits_balance: Mapped[int] = mapped_column(Integer, default=0, server_default="0")` to `UserBilling`; extend `_apply_allotment` (and any snapshot/reset code that enumerates credit kinds — grep `ai_image_credits_balance` in quota_service.py and mirror every site) plus:

```python
def assert_render_credit(db: Session, user: User) -> UserBilling:
    billing = get_or_create_billing(db, user)
    if billing.render_credits_balance <= 0:
        raise HTTPException(status_code=402, detail="No render credits remaining. Upgrade your plan or buy a top-up.")
    return billing


def consume_render_credit(db: Session, billing: UserBilling) -> None:
    if billing.render_credits_balance <= 0:
        raise HTTPException(status_code=402, detail="No render credits remaining.")
    billing.render_credits_balance -= 1
    billing.updated_at = datetime.utcnow()
    db.commit()
```

If `UserBillingSnapshot`/admin schemas enumerate credit balances, extend them too (grep `ai_image_credits` across `backend/app` and mirror each hit; list every touched site in your report).

- [ ] **Step 5: Migration** — `docker compose exec backend alembic revision --autogenerate -m "render credits balance"`; edit the generated file to only add/drop the `render_credits_balance` column (autogenerate may pick up noise — strip it); `docker compose restart backend` applies it.

- [ ] **Step 6: Verify** — `docker compose exec backend pytest tests/ -v` → all green (new 4 + full baseline).

- [ ] **Step 7: Commit** — `git add backend/ && git commit -m "feat: render_credits quota kind with per-plan allotments"`

---

### Task 2: RenderJob model + schemas

**Files:**
- Create: `backend/app/models/render_job.py`; register import where models are aggregated (grep `from app.models` in `backend/app/models/__init__.py` and mirror)
- Create: migration (autogenerate)
- Create: `backend/app/schemas/render_job.py`

**Interfaces:**
- Produces (Tasks 3–5 depend on exact names): model `RenderJob`; schemas `RenderJobCreate { scene_id: int; lighting: str = "studio"; preset: str = "gold-18k-yellow"; width: int = 2048; height: int = 2048 }`, `RenderJobStatus { id, status, result_url: str | None, error: str | None, attempts: int, created_at }`, `RenderJobPayload { model_url: str; lighting: str; preset: str; width: int; height: int }`.

- [ ] **Step 1: Model**

```python
from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.scene import Base


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scene_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True)
    model_ref: Mapped[str] = mapped_column(String(1024))  # storage model key, or absolute URL (dev/smoke)
    lighting: Mapped[str] = mapped_column(String(32), default="studio")
    preset: Mapped[str] = mapped_column(String(64), default="gold-18k-yellow")
    width: Mapped[int] = mapped_column(Integer, default=2048)
    height: Mapped[int] = mapped_column(Integer, default=2048)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    worker_token: Mapped[str] = mapped_column(String(64), default=lambda: uuid4().hex)
    result_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 2: Schemas** (`backend/app/schemas/render_job.py`) — Pydantic BaseModel + Field per repo convention; `RenderJobCreate` with `width/height Field(ge=256, le=8192)`, `lighting max_length=32`, `preset max_length=64`; the other two as listed in Interfaces.

- [ ] **Step 3: Migration** — autogenerate, prune noise, restart backend. Verify table: `docker compose exec backend python -c "from app.models.render_job import RenderJob; print(RenderJob.__tablename__)"`.

- [ ] **Step 4: Full backend suite green; commit** — `git commit -m "feat: RenderJob model, schemas, migration"`.

---

### Task 3: user-facing endpoints (create + status)

**Files:**
- Create: `backend/app/features/render_jobs/__init__.py`, `backend/app/features/render_jobs/service.py`
- Create: `backend/app/routers/render_jobs.py`; register in `backend/app/routers/__init__.py` with `prefix="/render-jobs", tags=["render-jobs"]`
- Test: `backend/tests/test_render_jobs_api.py`

**Interfaces:**
- Consumes: Task 1 credit functions; Task 2 model/schemas; `require_owned_scene` from `app.features.scene.service`; `public_file_url` from `app.core.public_urls`; billing features snapshot for `max_image_resolution` (grep how `max_image_resolution` is read in `quota_service.snapshot`/`_features_for_tier` and reuse).
- Produces: `POST /render-jobs` (auth) → `RenderJobStatus` 201; `GET /render-jobs/{job_id}` (auth, owner-only 404 otherwise) → `RenderJobStatus` with `result_url` via `public_file_url(result_key)` when completed.

- [ ] **Step 1: Failing tests** — service-level, mirroring existing API tests' style:

```python
def test_create_job_requires_credit(db, user):        # 402 when render_credits_balance == 0
def test_create_job_enqueues_and_does_not_charge(db, user, scene):  # status queued, balance unchanged, dims clamped to plan cap
def test_status_owner_only(db, user, other_user):     # other_user fetching -> 404
```

Write them fully against `app.features.render_jobs.service` functions `create_job(db, user, body) -> RenderJob` and `get_job_for_user(db, user, job_id) -> RenderJob` (404 via HTTPException). Adapt fixtures to conftest (if there is no `scene` fixture, create a Scene inline the way other tests do — quote your approach).

- [ ] **Step 2: RED** — pytest on the new file fails (module missing).

- [ ] **Step 3: Implement service** — `create_job`: `assert_render_credit` (no consume); resolve scene via `require_owned_scene(db, body.scene_id, user.id)`; `model_ref` = the scene's stored model key (grep the Scene model for its model-key column and use it; quote the column you used); clamp width/height to the plan's `max_image_resolution`; insert queued job. `get_job_for_user`: owner check → job or 404. Router: thin, mirrors `renders.py` style. Register router.

- [ ] **Step 4: GREEN + full suite; commit** — `git commit -m "feat: render-job create/status endpoints with credit gate"`.

---

### Task 4: worker endpoints (claim / payload / complete / fail)

**Files:**
- Modify: `backend/app/config.py` (`render_worker_token: str | None = Field(default=None, validation_alias="RENDER_WORKER_TOKEN")`)
- Modify: `backend/app/features/render_jobs/service.py`, `backend/app/routers/render_jobs.py`
- Test: `backend/tests/test_render_jobs_worker.py`

**Interfaces:**
- Produces: `POST /render-jobs/claim` (header `X-Worker-Token`) → 200 `{job_id, page_token}` or 204 when queue empty; `GET /render-jobs/{id}/payload?token=` → `RenderJobPayload`; `POST /render-jobs/{id}/complete?token=` (multipart `file`) → stores PNG, consumes credit, `completed`; `POST /render-jobs/{id}/fail?token=` (body `{error: str}`) → requeue or `failed`, never charges.

- [ ] **Step 1: Failing tests** (write fully):
  - claim: 401 wrong/missing header; 503 when settings token unset; claims oldest queued → running, attempts+1; 204 empty queue; concurrent-safety at least via `with_for_update(skip_locked=True)` in implementation (assert single claim across two sequential calls).
  - payload: 401 wrong token; returns `model_url` — if `model_ref` starts with `http` return as-is, else `presign_get(model_ref)`.
  - complete: 401 wrong token; happy path writes bytes via `write_bytes(render_key(user_id, "png"), data, content_type="image/png")`, sets `result_key`, consumes exactly 1 credit, idempotent (second call 409 or no-op without double-charge — pick 409, assert it).
  - fail: attempts 1→ requeued (status queued, error recorded); attempts ≥3 → failed; balance unchanged in both.

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement** — claim uses `select(RenderJob).where(status=="queued").order_by(created_at).with_for_update(skip_locked=True).limit(1)`; worker-token dependency raises 401/503; complete reads `UploadFile`, guards `status == "running"` (else 409), stores, consumes credit, commits. Fail: guard running, increment handled at claim — requeue resets status only.

- [ ] **Step 4: GREEN + full suite; commit** — `git commit -m "feat: render-job worker claim/payload/complete/fail endpoints"`.

---

### Task 5: harness job mode (frontend)

**Files:**
- Modify: `src/features/viewer/ui/RenderHarness.tsx`
- Create: `src/lib/golden/job-mode.ts` (pure helpers) + `src/lib/__tests__/job-mode.test.ts`

**Interfaces:**
- Consumes: `renderAtResolution` (`src/lib/offscreen-render.ts`, returns `Promise<Blob>`), `getHiresRefs` (`src/stores/hires-export-store.ts`), `getRenderFidelity` (`src/stores/render-fidelity-store.ts`), API base `NEXT_PUBLIC_API_URL` (see `src/lib/api-url.ts` — reuse its helper).
- Produces: URL contract for the worker — `/render-harness?job=<id>&token=<t>`; `window.__JOB_STATE__`: `"rendering" → "done"` or `"error:<msg>"`.

- [ ] **Step 1: Pure helpers + tests (TDD)** — `src/lib/golden/job-mode.ts`:

```ts
export type JobPayload = { model_url: string; lighting: string; preset: string; width: number; height: number };

export function jobEndpoints(apiBase: string, jobId: string, token: string) {
  const base = apiBase.replace(/\/$/, "");
  const q = `?token=${encodeURIComponent(token)}`;
  return {
    payload: `${base}/render-jobs/${jobId}/payload${q}`,
    complete: `${base}/render-jobs/${jobId}/complete${q}`,
    fail: `${base}/render-jobs/${jobId}/fail${q}`,
  };
}

export function isValidPayload(p: unknown): p is JobPayload {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return typeof o.model_url === "string" && typeof o.lighting === "string" &&
    typeof o.preset === "string" && typeof o.width === "number" && typeof o.height === "number";
}
```

Tests: trailing-slash normalization, token encoding, payload validation accept/reject (write 4–5 cases fully; RED → GREEN).

- [ ] **Step 2: Wire job mode into RenderHarness** — when `job` + `token` params present: set `__JOB_STATE__="rendering"`; fetch payload (validate with `isValidPayload`, else fail-and-error); use `payload.model_url` as `modelUrl` if it ends `.glb`/`.gltf`, else error; mount ViewerCanvas with payload lighting/preset; after the existing 60-frame ready signal, call:

```ts
const refs = getHiresRefs();
if (!refs) throw new Error("hires refs unavailable");
const blob = await renderAtResolution({ ...refs, ...getRenderFidelity(), width: payload.width, height: payload.height, pixelRatio: 1 });
const form = new FormData();
form.append("file", blob, "render.png");
const res = await fetch(endpoints.complete, { method: "POST", body: form });
if (!res.ok) throw new Error(`complete: ${res.status}`);
window.__JOB_STATE__ = "done";
```

On any error: POST `endpoints.fail` with `{ error: message }` (best-effort) and set `__JOB_STATE__ = "error:" + message`. Keep golden mode behavior byte-identical (goldens must still pass).

- [ ] **Step 3: Verify** — `npx vitest run` (23 + new pass), `npx tsc --noEmit` (no new), and with dev server: `npm run test:golden` still five PASS (proves golden mode untouched).

- [ ] **Step 4: Commit** — `git commit -m "feat: render-harness job mode — full-fidelity offscreen render + upload"`.

---

### Task 6: worker script

**Files:**
- Create: `scripts/render-worker/worker.mjs`
- Modify: `package.json` (script `"worker:render": "node scripts/render-worker/worker.mjs"`)

**Interfaces:**
- Consumes: `launchDeterministicBrowser`, `BASE_URL` from `scripts/golden/browser.mjs`; env `RENDER_WORKER_TOKEN`, `RENDER_API_URL` (default `http://localhost:8765`), `HARNESS_BASE_URL`.

- [ ] **Step 1: Implement**

```js
import { BASE_URL, launchDeterministicBrowser } from "../golden/browser.mjs";

const API = process.env.RENDER_API_URL ?? "http://localhost:8765";
const TOKEN = process.env.RENDER_WORKER_TOKEN;
const ONCE = process.argv.includes("--once");
const POLL_MS = 5000;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

if (!TOKEN) { console.error("RENDER_WORKER_TOKEN required"); process.exit(1); }

async function claim() {
  const res = await fetch(`${API}/render-jobs/claim`, { method: "POST", headers: { "X-Worker-Token": TOKEN } });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`claim: ${res.status}`);
  return res.json();
}

async function runJob(browser, { job_id, page_token }) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/render-harness?job=${job_id}&token=${encodeURIComponent(page_token)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__JOB_STATE__ === "done" || String(window.__JOB_STATE__).startsWith("error"),
      { timeout: JOB_TIMEOUT_MS },
    );
    const state = await page.evaluate(() => window.__JOB_STATE__);
    console.log(`job ${job_id}: ${state}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await launchDeterministicBrowser();
  try {
    for (;;) {
      const job = await claim().catch((e) => { console.error(e.message); return null; });
      if (job) await runJob(browser, job).catch((e) => console.error(`job ${job.job_id}: ${e.message}`));
      else if (ONCE) break;
      if (ONCE && job) break;
      if (!job) await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } finally {
    await browser.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Commit** — `git commit -m "feat: playwright render worker — claim, drive harness job mode, poll"`.

---

### Task 7: end-to-end smoke + docs

**Files:**
- Create: `scripts/render-worker/seed-smoke-job.py` (run inside backend container)
- Modify: `README.md` (short "Server renders" section)

- [ ] **Step 1: Seed script** — creates (or reuses) a smoke user + billing with 5 render credits, inserts a RenderJob with `model_ref="http://localhost:3000/test-fixtures/PDR-2413.glb"`, `lighting="studio"`, 1024×1024, prints `job_id`, `worker token from settings check`, and the user's starting balance. Write it fully using the backend's session factory (mirror how `scripts.fetch_cc0_hdris` style scripts get a session — grep `backend/scripts/` or use `from app.database import SessionLocal`).

- [ ] **Step 2: Full-stack smoke** — with `RENDER_WORKER_TOKEN=smoketoken` exported for the backend (docker compose env override or `.env`) and dev web server running:

```bash
docker compose up -d postgres backend
npm run dev &
docker compose exec backend python -m scripts.seed_smoke_job   # adjust to actual path
RENDER_WORKER_TOKEN=smoketoken RENDER_API_URL=http://localhost:8765 npm run worker:render -- --once
```

Then verify via psql or a follow-up python one-liner: job status `completed`, `result_key` set, balance decremented by exactly 1, and the stored PNG is >20 KB. Also run the failure path: seed a job with a bogus `model_ref` URL, run worker `--once`, verify it lands `queued` with attempts 1 (then twice more → `failed`), balance unchanged.

- [ ] **Step 3: Golden + unit suites still green** — `npm run test:golden` (five PASS), `npx vitest run`, `docker compose exec backend pytest tests/`.

- [ ] **Step 4: README section** — how to run the worker locally, env vars, the credits model, and that GPU/serverless deployment lands in Phase 3.

- [ ] **Step 5: Commit** — `git commit -m "feat: render-job e2e smoke seed + worker docs"`.

---

## Done criteria (spec §6 "server render service" + §8 data flow)

- Job lifecycle queued→running→completed with retry ≤3 and no-charge-on-failure ✅ Tasks 2–4
- Credits metered per plan, debited only on success ✅ Tasks 1, 4
- Renders produced by the production full-fidelity pipeline, hardware-independent ✅ Task 5
- Worker claims over HTTP with shared secret; per-job page tokens ✅ Tasks 4, 6
- Proven end-to-end locally including the failure path ✅ Task 7

**Deferred (recorded):** 360 video (Phase 2 per spec), serverless GPU deploy + R2 wiring (Phase 3), UI for requesting server renders (Phase 2 workflows), top-up packs for render credits.
