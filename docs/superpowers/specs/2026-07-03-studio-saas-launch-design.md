# DevJewels Studio — SaaS Launch Design

**Date:** 2026-07-03
**Status:** Draft for review
**Owner:** Smit Desai (solo developer)

## 1. Overview

Turn the existing jewelry-renderer app into a launched, self-serve SaaS for US retail jewelers within ~90 days. The codebase already has auth, Stripe billing (Checkout, Portal, webhooks), plan tiers with credit quotas, publish/share, variants, admin analytics, and a client-side Three.js render pipeline. This design closes the gap between "feature-complete prototype" and "product that beats competitors": catalog-grade render quality, two polished workflows, production infrastructure, and a pilot cohort.

## 2. Goals and success criteria

- **G1 — Render quality:** 5 real reference rings rendered in-studio judged "comparable or better" vs paid render-studio output by 2 practicing jewelers.
- **G2 — Self-serve:** a stranger can sign up, pay, upload CAD, export renders, share, and embed with zero developer assistance.
- **G3 — Revenue:** ≥2 of 5 pilot jewelers convert to paid within 30 days of pilot start.
- **G4 — No regressions:** golden-image tests and the end-to-end journey test pass in CI on every change.

Non-goals (out of scope for this cycle): India-market pricing, white-label/agency tier, server-side GPU render farm, AI text-to-CAD, mobile apps, DPP/provenance features.

## 3. Target customer and jobs

**First buyer:** independent US retail jewelers (~18–20K stores nationally), including custom-design shops.

Two jobs shipped at launch, sharing one render core:

1. **Custom-sale closer** — upload a customer's custom ring CAD → photoreal interactive viewer + metal/stone variants → share-link sent to the end customer → sale closes before manufacturing.
2. **Catalog engine** — bulk-upload SKUs → catalog-grade stills + 360 videos + embeddable viewers for the store's website, replacing $25–100/SKU photography.

## 4. Pricing and packaging

Keep the tiers already implemented in `backend/app/features/billing/plans.py`: `free` (watermarked exports, 50 model credits), `grow`, `studio`, plus top-up packs. Free tier is the demo/lead magnet. Final dollar amounts set at Phase 3 (target band $99–$799/mo; blended ARPU assumption ~$200/mo).

## 5. Competitive positioning

- Human render studios: 3–5 day turnaround, $30–100 per image. Studio: minutes, subscription.
- Threekit / VNTANA: horizontal enterprise 3D, $50K+/yr, not jewelry-native (no gem optics, no jewelry CAD ingestion).
- Desktop CAD renderers (RhinoGold/MatrixGold/KeyShot): require a CAD operator and licenses; not shareable/embeddable by default.

Moat: browser-based jewelry-native pipeline (.3dm/.stl → GLB), gem/metal material intelligence, share + embed distribution.

## 6. Architecture

**Unchanged (already correct):**
- Client-side rendering (customer's GPU does the work; server costs stay ~2% of revenue).
- Feature-driven layout (`src/features/*`, `backend/app/features/*`), thin routers.
- Postgres-only with Alembic; Docker compose dev environment.
- Existing auth, billing, quota, publish, variants, admin, feature-flag features.

**Changed/added, by phase (see §7):** viewer material system, lighting presets, offscreen 8K export, share page polish, `VideoCaptureBridge` mount, bulk upload queue, embed widget, production deploy, landing page, onboarding emails, analytics.

**AI backgrounds:** remain serverless. `AI_BACKGROUND_MODE` calls a per-image API (fal.ai or Replicate, ~$0.01–0.03/image) metered by existing `ai_image_credits`. No dedicated GPU host.

**Hosting (Phase 3):** Vercel (web) + Railway or Fly.io (FastAPI) + Neon (Postgres) + Cloudflare R2 + CDN (zero egress). Estimated $60–115/mo at launch, ~$270–690/mo at ~300 customers.

## 7. Phase plan (90 days, solo developer + AI agents)

### Phase 1 — Render quality to catalog grade (weeks 1–4)
- Gem material upgrade: dispersion/fire approximation, per-stone presets (diamond, sapphire, ruby, emerald).
- Metal PBR presets with measured values: yellow/rose/white gold, platinum, silver.
- 5 studio lighting presets built from curated HDRIs (existing `fetch_cc0_hdris` pipeline).
- Tone mapping + postprocessing tuning; 8K offscreen still export.
- Golden-image benchmark harness: 5 reference rings (real CAD from network), headless renders compared via SSIM threshold; wired into CI.
- **Hard gate:** G1 passes (2 jewelers judge side-by-sides comparable-or-better vs render-studio output).

### Phase 2 — Two workflows finished (weeks 5–8)
- Custom-sale: public share-link page polish (mobile-first — end customers open these on phones), variant switcher UX, mount `VideoCaptureBridge` in `ViewerCanvas` for 360 MP4 export (Mediabunny).
- Catalog: bulk upload queue (progress, retry, per-file errors), embed widget (script tag + iframe with origin allowlist), export presets (Shopify/Etsy image dimensions).
- **Hard gate:** complete jeweler journey (upload → variants → share → embed) executed by a non-developer with zero help.

### Phase 3 — Production and storefront (weeks 9–11)
- Deploy: Neon Postgres, R2 + CDN per existing README production notes, Stripe live mode, custom domain.
- Landing page in the same Next app (marketing copy from the marketing/agency side).
- Onboarding email sequence via existing email service; PostHog product analytics on the signup→upload→export funnel.
- **Hard gate:** G2 passes (stranger self-serves end to end, observed but unassisted).

### Phase 4 — Pilot cohort (weeks 12–13)
- 5 pilot jewelers from the family/industry network; free month; weekly feedback calls.
- Funnel dashboards watched daily; fix top friction items same-week.
- **Hard gate:** G3 (≥2 convert to paid).

Each phase gets its own implementation plan (spec → plan → implement → verify) before code is written.

## 8. Data flow (summary)

1. Jeweler uploads `.3dm`/`.stl` → parsed client-side → GLB canonical → presigned upload to R2 → `models/` (immutable cache headers, existing convention).
2. Viewer loads GLB from CDN, applies material/lighting presets client-side; variants are parameter sets stored with the scene.
3. Exports: stills rendered offscreen client-side (up to plan's `max_image_resolution`), 360 MP4 muxed client-side, uploaded to R2; quota debited via existing `quota_service`.
4. Share/embed: public scene endpoint serves read-only scene + assets from CDN; embed restricted by origin allowlist; rate-limited.
5. Billing: Stripe Checkout/webhooks (existing) mutate `UserBilling`; webhook handling must be idempotent (verified by tests, §9).

## 9. Quality, testing, and error handling

- **Money paths first:** pytest coverage for billing/quota/webhook flows, including webhook idempotency and plan up/downgrade edge cases.
- **Golden-image CI:** render-pipeline changes must keep 5 reference renders within SSIM threshold of approved goldens.
- **Journey test:** one Playwright test — signup → upload sample CAD → render → share → embed — required green in CI.
- **Error handling:** invalid CAD → specific human-readable messages; render OOM → automatic resolution step-down; quota exceeded → upgrade prompt, never a dead end; upload failures → per-file retry in the bulk queue.
- **Performance budget:** typical ring GLB interactive in <3s, 60fps orbit on a mid-range laptop; bundle size checked in CI.
- **Security:** presigned uploads with strict type/size validation, embed origin allowlist, rate limiting on public endpoints, no secrets in client bundles. Sentry (already wired) for both tiers.

## 10. Business context (for reference)

- Targets: $30K MRR around month 20–24; $1M+ ARR year 3; blended ARPU ~$200/mo; churn assumption 2–3%/mo (embeds create stickiness).
- Solo developer constraint: phases are sequential; scope cuts happen inside a phase rather than letting a phase half-ship.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Render quality judged "not photoreal enough" by jewelers | Phase 1 hard gate before anything else; golden-ring benchmark set from real customer CAD |
| Weak client laptops choke on 8K export | Resolution step-down; server-side "pro render" as a future premium feature, explicitly out of scope now |
| Solo-dev scope creep | Hard gates per phase; non-goals list in §2; each phase gets its own plan |
| Pilot jewelers don't convert | Pilots come from warm network; weekly calls; free tier keeps them in funnel even if unconverted |
| Stripe/webhook bugs corrupt billing | Tests-first on money paths; Stripe test-mode replay before live mode |
