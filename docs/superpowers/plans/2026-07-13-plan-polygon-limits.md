# Plan Polygon Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enforce per-plan hard polygon caps on model upload (Free 100k / Grow 500k / Studio 2M) with Upgrade + Decimate-to-cap escapes, removing the soft amber warning.

**Architecture:** Add `max_polygons` to `PlanQuotas` and expose it on `PlanFeatures`. Client gates Save using billing `features.max_polygons` and sends `polygon_count` on register/direct upload. Backend `assert_polygon_limit` rejects over-cap saves with 402 before consuming model credits.

**Tech Stack:** FastAPI, Pydantic, existing billing/quota services, Next.js upload flow (`useUploadModelFlow`, `persistUploadedModel`), `decimateModelRoot`.

**Design spec:** [`docs/superpowers/specs/2026-07-13-plan-polygon-limits-design.md`](../specs/2026-07-13-plan-polygon-limits-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/features/billing/plans.py` | `max_polygons` on `PlanQuotas` + per-tier values |
| `backend/app/schemas/billing.py` | `PlanFeatures.max_polygons` |
| `backend/app/features/billing/quota_service.py` | `_features_for_tier` + `assert_polygon_limit` |
| `backend/app/schemas/upload.py` | `RegisterRequest.polygon_count` |
| `backend/app/routers/upload.py` | Pass `polygon_count` into service |
| `backend/app/features/upload/service.py` | Assert poly limit on register + direct save |
| `backend/tests/test_billing_quota.py` | Quota value assertions |
| `backend/tests/test_polygon_limit.py` | Assert helper + upload wiring tests |
| `src/lib/billing/types.ts` | `PlanFeatures.max_polygons` |
| `src/lib/upload/count-polygons.ts` | Keep `formatPolyCount`; retire warn-only threshold as Free default export |
| `src/lib/upload/persist-model.ts` | Send `polygon_count` on register + multipart fallback |
| `src/features/upload/hooks/useUploadModelFlow.ts` | Load billing cap; hard-block; Decimate-to-cap |
| `src/features/upload/ui/UploadModelShell.tsx` | Hard-block panel UI; disable Save |
| `src/features/upload/ui/UploadDropPanel.tsx` | Plan-aware tip copy |
| `src/features/billing/ui/PricingPage.tsx` | Show max polygons per plan |
| `src/features/billing/ui/ProfileShell.tsx` | Show max polygons in account features |

---

### Task 1: Plan quotas + PlanFeatures.max_polygons

**Files:**
- Modify: `backend/app/features/billing/plans.py`
- Modify: `backend/app/schemas/billing.py`
- Modify: `backend/app/features/billing/quota_service.py` (`_features_for_tier`)
- Modify: `backend/tests/test_billing_quota.py`
- Modify: `src/lib/billing/types.ts`

- [x] **Step 1: Write the failing test**

Add to `backend/tests/test_billing_quota.py`:

```python
def test_plan_quotas_define_max_polygons():
    assert PLAN_QUOTAS["free"].max_polygons == 100_000
    assert PLAN_QUOTAS["grow"].max_polygons == 500_000
    assert PLAN_QUOTAS["studio"].max_polygons == 2_000_000
```

Also extend existing allotment tests:

```python
# in test_free_plan_allotments
assert quotas.max_polygons == 100_000

# in test_grow_plan_matches_gemora_parity_targets
assert quotas.max_polygons == 500_000
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_billing_quota.py::test_plan_quotas_define_max_polygons -v`

Expected: FAIL (`PlanQuotas` has no `max_polygons` or AttributeError)

- [x] **Step 3: Implement quota + feature field**

In `backend/app/features/billing/plans.py`, add `max_polygons: int` to `PlanQuotas` and set:

```python
# free
max_polygons=100_000,
# grow
max_polygons=500_000,
# studio
max_polygons=2_000_000,
```

In `backend/app/schemas/billing.py` `PlanFeatures`:

```python
max_polygons: int
```

In `backend/app/features/billing/quota_service.py` `_features_for_tier`:

```python
return PlanFeatures(
    max_variants_per_model=quotas.max_variants_per_model,
    max_image_resolution=quotas.max_image_resolution,
    max_polygons=quotas.max_polygons,
    watermark_exports=quotas.watermark_exports,
    embed_enabled=True,
    batch_export_enabled=tier != "free",
    video_8k_enabled=tier != "free",
)
```

In `src/lib/billing/types.ts`:

```typescript
export type PlanFeatures = {
  max_variants_per_model: number;
  max_image_resolution: number;
  max_polygons: number;
  watermark_exports: boolean;
  embed_enabled: boolean;
  batch_export_enabled: boolean;
  video_8k_enabled: boolean;
};
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_billing_quota.py -v`

Expected: PASS

- [~] **Step 5: Commit** *(skipped — working tree left uncommitted by request)*

```bash
git add backend/app/features/billing/plans.py backend/app/schemas/billing.py \
  backend/app/features/billing/quota_service.py backend/tests/test_billing_quota.py \
  src/lib/billing/types.ts
git commit -m "$(cat <<'EOF'
feat(billing): add max_polygons plan quota

EOF
)"
```

---

### Task 2: assert_polygon_limit

**Files:**
- Modify: `backend/app/features/billing/quota_service.py`
- Create: `backend/tests/test_polygon_limit.py`

- [x] **Step 1: Write the failing test**

```python
# backend/tests/test_polygon_limit.py
"""Polygon plan limit assert (upload gate)."""

import pytest
from fastapi import HTTPException

from app.features.billing.quota_service import assert_polygon_limit, get_or_create_billing


def test_assert_polygon_limit_allows_at_cap(db, sample_user):
    billing = assert_polygon_limit(db, sample_user, 100_000)
    assert billing is not None


def test_assert_polygon_limit_402_when_over_free_cap(db, sample_user):
    get_or_create_billing(db, sample_user)  # defaults free
    with pytest.raises(HTTPException) as exc:
        assert_polygon_limit(db, sample_user, 100_001)
    assert exc.value.status_code == 402
    assert "Polygon limit" in str(exc.value.detail)


def test_assert_polygon_limit_grow_cap(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    billing.plan_tier = "grow"
    db.commit()
    assert_polygon_limit(db, sample_user, 500_000)
    with pytest.raises(HTTPException) as exc:
        assert_polygon_limit(db, sample_user, 500_001)
    assert exc.value.status_code == 402
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_polygon_limit.py -v`

Expected: FAIL (`assert_polygon_limit` not defined)

- [x] **Step 3: Implement assert helper**

Add to `backend/app/features/billing/quota_service.py` (near other `assert_*` helpers):

```python
def assert_polygon_limit(db: Session, user: User, polygon_count: int) -> UserBilling:
    if polygon_count < 0:
        raise HTTPException(status_code=400, detail="polygon_count must be >= 0")
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    cap = get_quotas(tier).max_polygons
    if polygon_count > cap:
        raise HTTPException(
            status_code=402,
            detail=f"Polygon limit exceeded for {PLAN_LABELS[tier]} (max {cap}).",
        )
    return billing
```

Ensure `HTTPException` and `PLAN_LABELS` / `get_quotas` imports already present (add if missing).

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_polygon_limit.py -v`

Expected: PASS

- [~] **Step 5: Commit** *(skipped — working tree left uncommitted by request)*

```bash
git add backend/app/features/billing/quota_service.py backend/tests/test_polygon_limit.py
git commit -m "$(cat <<'EOF'
feat(billing): assert polygon limit by plan tier

EOF
)"
```

---

### Task 3: Wire polygon_count through upload API

**Files:**
- Modify: `backend/app/schemas/upload.py`
- Modify: `backend/app/routers/upload.py`
- Modify: `backend/app/features/upload/service.py`
- Modify: `backend/tests/test_polygon_limit.py` (or add upload API test if fixtures exist)

- [x] **Step 1: Extend failing tests for missing count / service call order**

Add to `backend/tests/test_polygon_limit.py`:

```python
from pydantic import ValidationError

from app.schemas.upload import RegisterRequest


def test_register_request_requires_polygon_count():
    with pytest.raises(ValidationError):
        RegisterRequest(key="users/1/models/a.glb")


def test_register_request_accepts_polygon_count():
    body = RegisterRequest(key="users/1/models/a.glb", polygon_count=50_000)
    assert body.polygon_count == 50_000
```

- [x] **Step 2: Run to verify fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_polygon_limit.py::test_register_request_requires_polygon_count -v`

Expected: FAIL (field not required / not present)

- [x] **Step 3: Schema + service + router**

`RegisterRequest` in `backend/app/schemas/upload.py`:

```python
polygon_count: int = Field(..., ge=0)
```

`register_after_presign` / `save_direct_multipart` in `backend/app/features/upload/service.py`:

- Add `polygon_count: int` parameter
- Import and call `assert_polygon_limit(db, user, polygon_count)` **before** `assert_model_credit` / storage consume paths (after SKU check is fine; before credit consume is required)

`register_upload` router: pass `polygon_count=body.polygon_count`.

`upload_model` (direct): add Form field:

```python
polygon_count: int = Form(...),
```

Pass into `save_direct_multipart(..., polygon_count=polygon_count)`.

- [x] **Step 4: Run tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_polygon_limit.py tests/test_billing_quota.py -v`

Expected: PASS. Also run any existing upload tests:

Run: `cd backend && .venv/bin/python -m pytest tests/ -k upload -v --tb=short`

Fix any callers in tests that construct register payloads without `polygon_count`.

- [~] **Step 5: Commit** *(skipped — working tree left uncommitted by request)*

```bash
git add backend/app/schemas/upload.py backend/app/routers/upload.py \
  backend/app/features/upload/service.py backend/tests/test_polygon_limit.py
git commit -m "$(cat <<'EOF'
feat(upload): enforce polygon_count on register and direct save

EOF
)"
```

---

### Task 4: Client persist sends polygon_count

**Files:**
- Modify: `src/lib/upload/persist-model.ts`
- Modify: `src/lib/upload/count-polygons.ts`

- [x] **Step 1: Rename free default constant**

In `src/lib/upload/count-polygons.ts`:

```typescript
/** Free-tier (and guest) hard polygon cap — also default when billing unloaded. */
export const FREE_MAX_POLYGONS = 100_000;

/** @deprecated Use plan features.max_polygons; kept as alias for Free default. */
export const POLY_WARN_THRESHOLD = FREE_MAX_POLYGONS;
```

(Prefer migrating call sites to `FREE_MAX_POLYGONS` in Task 5 and then remove the deprecated alias if unused.)

- [x] **Step 2: Persist input + payloads**

In `src/lib/upload/persist-model.ts`:

```typescript
export type PersistModelInput = {
  file: File;
  preloaded: LoadedModel;
  modelConfig: PersistedModelConfig;
  slotSelections: Record<string, string>;
  sceneSettings: SceneSettingsBuckets;
  metadata: PersistModelMetadata;
  polygonCount: number;
};
```

In register JSON body add `polygon_count: input.polygonCount`.

In multipart fallback FormData add:

```typescript
fd.append("polygon_count", String(input.polygonCount));
```

- [x] **Step 3: Typecheck touched module**

Run: `npx tsc --noEmit` (expect errors only at `persistUploadedModel` call site until Task 5 — fix call in same commit if needed by passing `parsed.polyCount`).

Minimal call-site fix in `useUploadModelFlow.ts` `persistReadyModel`:

```typescript
const result = await persistUploadedModel({
  // ...existing fields
  polygonCount: parsed.polyCount,
});
```

- [~] **Step 4: Commit** *(skipped — working tree left uncommitted by request)*

```bash
git add src/lib/upload/persist-model.ts src/lib/upload/count-polygons.ts \
  src/features/upload/hooks/useUploadModelFlow.ts
git commit -m "$(cat <<'EOF'
feat(upload): send polygon_count on model persist

EOF
)"
```

---

### Task 5: Upload hard-block UI + Decimate-to-cap

**Files:**
- Modify: `src/features/upload/hooks/useUploadModelFlow.ts`
- Modify: `src/features/upload/ui/UploadModelShell.tsx`
- Modify: `src/features/upload/ui/UploadDropPanel.tsx`

- [x] **Step 1: Load billing cap in hook**

In `useUploadModelFlow`:

```typescript
import { useEffect, useState } from "react"; // useEffect already or add
import { fetchBillingAccount } from "@/lib/billing/client";
import { FREE_MAX_POLYGONS, formatPolyCount } from "@/lib/upload/count-polygons";
// remove POLY_WARN_THRESHOLD usage for gating
```

State:

```typescript
const [maxPolygons, setMaxPolygons] = useState(FREE_MAX_POLYGONS);
const [planLabel, setPlanLabel] = useState("Free");

useEffect(() => {
  let cancelled = false;
  fetchBillingAccount()
    .then((snap) => {
      if (cancelled) return;
      setMaxPolygons(snap.features.max_polygons);
      setPlanLabel(snap.plan_label);
    })
    .catch(() => {
      // guests / unauth → Free defaults
      if (!cancelled) {
        setMaxPolygons(FREE_MAX_POLYGONS);
        setPlanLabel("Free");
      }
    });
  return () => {
    cancelled = true;
  };
}, []);
```

Replace soft warn:

```typescript
const overPolyLimit = parsed != null && parsed.polyCount > maxPolygons;
```

Remove `decimated` state if only used to hide soft warn; or keep if still useful after decimate. Prefer `overPolyLimit` only (no soft path).

`handleDecimate`:

```typescript
const handleDecimate = useCallback(() => {
  if (!parsed) return;
  const nextCount = decimateModelRoot(parsed.preloaded.root, maxPolygons);
  setParsed({ ...parsed, polyCount: nextCount });
}, [parsed, maxPolygons]);
```

`handleSave`: early-return if `parsed.polyCount > maxPolygons` with error message matching server detail style.

Export from hook: `overPolyLimit`, `maxPolygons`, `planLabel`, `handleDecimate` (drop `showPolyWarning`).

- [x] **Step 2: Hard-block panel in shell**

In `UploadModelShell.tsx`, replace amber soft-warn block with:

```tsx
{overPolyLimit ? (
  <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
    <p>
      This model has {formatPolyCount(parsed?.polyCount ?? 0)} polygons — your{" "}
      {planLabel} plan allows up to {formatPolyCount(maxPolygons)}.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button asChild type="button" variant="default" size="sm">
        <Link href="/pricing">Upgrade plan</Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDecimate}
      >
        Decimate to ~{formatPolyCount(maxPolygons)}
      </Button>
    </div>
  </div>
) : null}
```

Disable primary Save when `overPolyLimit` (add `disabled={overPolyLimit || busy}` or equivalent on existing Save button).

Import `Link` from `next/link`.

- [x] **Step 3: Dropzone copy**

In `UploadDropPanel.tsx` replace the 100k tip line:

```tsx
<li>Polygon limits depend on your plan (Free 100k · Grow 500k · Studio 2M). See Pricing.</li>
```

- [!] **Step 4: Manual smoke (dev)** *(not run — see note below)*

1. Free / guest: load high-poly sample or file >100k → Save disabled; Decimate clears block.
2. Confirm register payload includes `polygon_count` in network tab.

- [~] **Step 5: Commit** *(skipped — working tree left uncommitted by request)*

```bash
git add src/features/upload/hooks/useUploadModelFlow.ts \
  src/features/upload/ui/UploadModelShell.tsx \
  src/features/upload/ui/UploadDropPanel.tsx \
  src/lib/upload/count-polygons.ts
git commit -m "$(cat <<'EOF'
feat(upload): hard-block over-cap meshes with upgrade and decimate

EOF
)"
```

---

### Task 6: Pricing + profile surfaces

**Files:**
- Modify: `src/features/billing/ui/PricingPage.tsx`
- Modify: `src/features/billing/ui/ProfileShell.tsx`

- [x] **Step 1: Pricing feature row**

After the variants row in `PricingPage.tsx`:

```tsx
<li className="flex items-center gap-2">
  <Check className="size-4 text-primary" />
  Up to {plan.features.max_polygons.toLocaleString()} polygons / model
</li>
```

(Optional: use `formatPolyCount` from `@/lib/upload/count-polygons` for `100k` / `500k` / `2M` labels.)

- [x] **Step 2: Profile features list**

In `ProfileShell.tsx` near max variants:

```tsx
<li>Max polygons per model: {features.max_polygons.toLocaleString()}</li>
```

- [~] **Step 3: Commit** *(skipped — working tree left uncommitted by request)*

```bash
git add src/features/billing/ui/PricingPage.tsx src/features/billing/ui/ProfileShell.tsx
git commit -m "$(cat <<'EOF'
feat(billing): show max polygons on pricing and profile

EOF
)"
```

---

### Task 7: Verification pass

**Files:** none (run / fix regressions)

- [x] **Step 1: Backend suite for billing + polygon + upload**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_billing_quota.py tests/test_polygon_limit.py tests/test_admin_quota_math.py -v
```

Expected: PASS

- [x] **Step 2: Frontend typecheck**

Run: `npx tsc --noEmit`

Expected: no new errors in touched files. Fix any `PlanFeatures` construction sites missing `max_polygons` (mocks, fixtures).

- [x] **Step 3: Grep stale soft-warn copy**

Run: `rg "recommended 100k|POLY_WARN_THRESHOLD|Keep poly count under 100k" -g '!docs/**'`

Expected: no user-facing soft-warn strings left (docs may still mention history).

- [~] **Step 4: Final commit if fixes needed** *(skipped — working tree left uncommitted by request)*

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: finish plan polygon limit wiring

EOF
)"
```

Only commit if there are fixups; otherwise skip empty commit.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Caps Free 100k / Grow 500k / Studio 2M | Task 1 |
| Soft warn removed | Task 5 |
| Hard block + Upgrade + Decimate-to-cap | Task 5 |
| `PlanFeatures.max_polygons` | Task 1 |
| `assert_polygon_limit` 402 | Task 2 |
| Required `polygon_count` on save | Tasks 3–4 |
| Assert before credit consume | Task 3 |
| Pricing + guest as Free | Tasks 5–6 |
| Existing library models untouched | N/A (no change) |
| Tests | Tasks 1–2, 7 |


---

## Implementation notes (2026-09-06)

**Status:** Tasks 1–7 implemented. Backend 69 passed, frontend 76 passed, `npx tsc --noEmit`
clean, `npm run check:boundaries` OK, no ESLint errors in touched files.

**Deviations from the plan, and why:**

1. **BFF routes needed the field too (plan omission).** `src/app/api/upload/register/route.ts`
   and `src/app/api/models/upload/route.ts` both re-build the outgoing payload from an explicit
   allowlist, so `polygon_count` was dropped before reaching FastAPI and every save would have
   failed 422. Both now forward it; register also rejects a missing/negative count with 400.
2. **Multipart fallback no longer swallows register rejections.** `persistUploadedModel` wrapped
   presign *and* register in one try/catch, so a 402 over-cap register triggered a full multipart
   re-upload that failed the same way and surfaced the fallback's generic "Upload failed". Register
   failures now throw `RegisterRejectedError`, which the fallback rethrows; the fallback still
   covers genuine presign/transport failures.
3. **`formatPolyCount` + `FREE_MAX_POLYGONS` moved to `src/lib/upload/polygon-limits.ts`.**
   `count-polygons.ts` imports three.js, and Task 6 puts `formatPolyCount` on the pricing page —
   importing it there would pull three into the marketing bundle. The new module is dependency-free;
   `count-polygons.ts` keeps only the mesh-counting functions.
4. **Cap loading extracted to `usePolygonCap`.** `useUploadModelFlow` was already over the
   200-line lint threshold; the billing fetch lives in its own hook instead of growing it further.
5. **Cap is re-read after mid-upload sign-in.** `handleAuthSuccess` (from the guest-auth flow)
   now refreshes the cap before retrying the save, so a paid user who signed in during upload is
   not judged against the Free default, and a stale cap cannot cause a surprise server 402.
6. **`formatPolyCount` renders whole millions as `2M`, not `2.0M`** — matches the spec's
   "Studio 2M" wording, which now appears in user-facing pricing copy.
7. **Extra tests beyond the plan:** `test_register_rejects_over_cap_before_consuming_model_credit`
   and its direct-save twin assert the spec's "assert before credit consume" ordering by checking
   the balance is untouched after a 402 — the plan only specified schema-shape tests for Task 3.
   `src/lib/__tests__/polygon-limits.test.ts` locks the three cap strings used in pricing copy.

**Not done — Task 5 Step 4 (manual dev smoke).** The studio stack is not running locally and
could not be started without disturbing other projects: the backend expects Postgres on :5432
with role `studio` (the running instance is another project's and has no such role), port :8000
is held by an unrelated "Sales Dashboard" app, and :8765 has a hung Python process. The browser
checks — Save disabled over cap, Decimate clearing the block, `polygon_count` visible in the
register request — remain unverified against a live app.
