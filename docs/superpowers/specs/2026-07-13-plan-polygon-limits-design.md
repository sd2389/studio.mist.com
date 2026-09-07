# Plan Polygon Limits — Design

**Date:** 2026-07-13  
**Status:** Approved — ready for implementation plan  
**Owner:** Smit Desai  
**Architecture rules:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/CODE-STANDARDS.md`](../../CODE-STANDARDS.md)

---

## 1. Overview

Replace the soft “recommended 100k” poly warning on model upload with **hard polygon caps by plan**. Users over their cap cannot save until they **Upgrade** or **Decimate** to their plan’s limit.

**Locked decisions (brainstorming)**

| Decision | Choice |
|----------|--------|
| Over-cap behavior | Hard block Save; escapes = Upgrade + Decimate |
| Caps | Free 100k · Grow 500k · Studio 2M |
| Soft warn | Removed for all tiers (no amber “recommended” path) |
| Decimate target | Plan hard cap (not always 100k) |
| Enforcement | Plan quota + client UI gate + server assert |

**Non-goals (v1)**

- Server-side GLB triangle recount (trust client-reported `polygon_count`)
- Re-checking / blocking existing models already in the library
- Per-upload high-poly add-on SKU (use Grow/Studio tiers)
- Storing `polygon_count` as a billed column on `scenes` (optional later)
- Soft warn thresholds below the hard cap

---

## 2. Success criteria

1. Free user with 795k mesh cannot save; sees Upgrade + Decimate-to-100k.
2. Grow user with 400k mesh saves with no poly messaging; Grow user with 600k is blocked until Decimate-to-500k or upgrade to Studio.
3. Studio user blocked only above 2M.
4. Save requests must include `polygon_count`; missing/invalid → 400; value above tier cap → 402. Honest clients cannot skip the gate. Server mesh recount to prevent spoofing is deferred (v1 trust model).
5. Pricing catalog / billing snapshot expose `max_polygons` so the UI and pricing page stay in sync with `PlanQuotas`.
6. Existing credit, storage, and auth upload flows unchanged when under cap.

---

## 3. Quotas & data

### 3.1 Plan quotas

Add `max_polygons: int` to `PlanQuotas` in `backend/app/features/billing/plans.py`:

| Tier | `max_polygons` |
|------|----------------|
| free | `100_000` |
| grow | `500_000` |
| studio | `2_000_000` |

Single source of truth — same pattern as `max_variants_per_model`.

### 3.2 Plan features API

Expose on `PlanFeatures` (Pydantic + `src/lib/billing/types.ts`):

```typescript
max_polygons: number;
```

Wire through `_features_for_tier` so `UserBillingSnapshot` and pricing catalog include it.

### 3.3 Upload payload

Finalize / direct save requests include required:

```json
{ "polygon_count": 795000 }
```

Non-negative integer. Missing or invalid → `400`. Over tier cap → `402` (matches model/storage credit rejects).

---

## 4. Backend enforcement

### 4.1 Assert helper

In `backend/app/features/billing/quota_service.py`:

```python
def assert_polygon_limit(db: Session, user: User, polygon_count: int) -> UserBilling:
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

### 4.2 Call sites

Invoke **before** `assert_model_credit` / consuming credits in:

- Presign finalize / create-scene save path (`upload/service.py`)
- `save_direct_multipart`

Do not consume model credit or storage accounting when polygon assert fails.

### 4.3 Trust model

v1: client-reported count after client-side parse/decimate. Same class of trust as client-sent `model_config`. Follow-up: optional server mesh count on ingest.

---

## 5. Frontend upload UX

### 5.1 Hard-block panel

In `UploadModelShell` / `useUploadModelFlow`:

- Condition: `parsed.polyCount > maxPolygons` (from billing `features.max_polygons`; guests → Free `100_000`)
- Remove amber soft-warn / `POLY_WARN_THRESHOLD` as a user-facing “recommended” gate (constant may remain as Free default or rename to plan-driven)
- Copy: “This model has {count} polygons — your {plan} plan allows up to {cap}.”
- Actions:
  - **Upgrade plan** → `/pricing`
  - **Decimate to ~{cap}** → `decimateModelRoot(root, maxPolygons)`; refresh `polyCount`; unlock Save when ≤ cap
- Primary Save disabled while over cap
- If server returns 402 polygon detail, surface same message and keep user on ready phase

### 5.2 Dropzone / help copy

Replace “Keep poly count under 100k…” with plan-aware or pricing-linked copy (e.g. limits depend on plan — see Pricing).

### 5.3 Pricing page

Show max polygons per tier alongside existing feature rows (variants, resolution, etc.).

### 5.4 PlanGate

Upload uses dedicated hard-block UI. Optional: extend `PlanGate` `require` with `"polygons"` only if another surface needs it; not required for v1 upload.

---

## 6. Edge cases

| Case | Behavior |
|------|----------|
| Guest uploading | Treat as Free (100k); auth-to-save still applies per existing guest flow |
| Decimate slightly over target | Cap check is `>`; decimate aims for `max_polygons`; if still over due to simplify tolerance, keep block and allow retry or Upgrade |
| User upgrades mid-flow | Re-fetch billing snapshot (or after return from pricing); recompute lock |
| Existing high-poly library models | Unchanged; limit applies to **new** uploads only |
| Replacing / re-saving model bytes | Same assert on any path that creates a new billed model upload |

---

## 7. Error handling

- Client over-cap: no save request; hard-block panel only
- Server 402 polygon: show detail; restore ready phase; do not clear mesh
- Network / other errors: existing upload error handling unchanged

---

## 8. Testing

**Backend**

- `test_plan_quotas_define_max_polygons` — Free/Grow/Studio values
- `test_assert_polygon_limit_402_when_over` / allow when under or equal
- Upload API: over-cap rejected before credit consume; under-cap succeeds

**Manual smoke**

1. Free + ~795k mesh → Save disabled; Decimate → ~100k → Save works
2. Grow mock + 400k → no panel; Save works
3. Grow + 600k → block; Decimate → ~500k → Save works
4. Pricing lists 100k / 500k / 2M
5. Omitting `polygon_count` on API → 400

---

## 9. Implementation order

1. `PlanQuotas.max_polygons` + `PlanFeatures` backend/frontend types + pricing catalog
2. `assert_polygon_limit` + wire upload save paths + require `polygon_count`
3. Upload flow: hard-block UI, Decimate-to-cap, disable Save, dropzone copy
4. Pricing page feature row
5. Tests + smoke

---

## 10. Future (deferred)

- Server-side triangle count verification on ingest
- Persist `polygon_count` on `scenes` for admin / analytics
- Soft performance tip below hard cap for Studio (optional)
- Editor re-import / replace-model path sharing the same assert helper
