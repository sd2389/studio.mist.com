# Competitive Upgrade — Later Work Backlog

**Date:** 2026-07-10  
**Status:** Deferred (explicitly out of scope for the ordered full-slice competitive upgrade)  
**Companion design:** [`docs/superpowers/specs/2026-07-10-competitive-upgrade-design.md`](../specs/2026-07-10-competitive-upgrade-design.md)  
**Related ideas catalog:** [`.planning/FEATURE-IDEAS.md`](../../../.planning/FEATURE-IDEAS.md)

This file captures everything we deliberately kept **out of scope** for the approved competitive upgrade (ordered approach 2 / full slice C). Items here are not abandoned — they are parked so implementation plans stay focused on beating Gemora in the live viewer, slim studio IA, and polishing existing embed/360/batch/AI paths.

---

## How to use this backlog

1. Do not pull items into the current design’s five phases unless the success bar changes.
2. When scheduling later work, promote an item into a new design/plan with its own success criteria.
3. Prefer building on existing features (`embed`, `variants`, `batch_export`, `ai_background`, `ai_on_model`, billing) over parallel systems.

**Suggested future phase labels** (for planning only):

| Label | Meaning |
|-------|---------|
| **Post-slice polish** | After phases 1–5 ship and jewelers validate |
| **Growth** | Monetization / distribution expansions |
| **Platform** | Infra that unlocks many features |
| **Category leap** | Tier-2/3/4 ideas from competitive research |
| **Non-goal** | Explicitly rejected for this product direction |

---

## A. Rejected / non-goals for this upgrade

### A1. Param-only glass tuning as the long-term gem solution
- **What:** Keep `MeshPhysicalMaterial` + `GEM_CONFIGS` transmission/IOR/dispersion knobs as the permanent gem renderer; only retune numbers.
- **Why deferred / rejected:** Competitive research and live comparisons showed param-only glass still reads as “glass blob,” not jewelry fire/sparkle. Success bar is **beat Gemora in the interactive viewer**, which requires a dedicated jewelry gem material path.
- **Future phase:** **Non-goal** for realtime gems. Config numbers in `GEM_CONFIGS` remain as *data* feeding the new shader; they are not a substitute for it.

### A2. Replacing the realtime gem shader with AI stills
- **What:** Use AI-generated diamond photos as the primary “look good” path instead of fixing live Three.js gems.
- **Why deferred:** Breaks WYSIWYG (viewer ≠ export), fails interactive demos, and fights the product moat (browser jewelry optics).
- **Future phase:** **Non-goal**. AI lifestyle/on-model remains a *marketing still* layer on top of the same live materials.

---

## B. Deferred from design sections §1–§5

### B1. UI chrome beyond Metal · Gem · Light · Export (+ More)
- **From:** §1 / §2
- **What:** New studio dashboards, card-grid marketing chrome inside the editor, permanent multi-panel control suites.
- **Why deferred:** Declutter IA first; Gemora wins on simplicity. Dense chrome reintroduced mid-slice would undo §2.
- **Future phase:** **Post-slice polish** only if jeweler feedback demands a specific advanced surface.

### B2. Unrelated page rewrites
- **From:** §2
- **What:** Rewriting auth, billing portal, admin, marketing landing, catalog admin, or other non-studio pages as part of this upgrade.
- **Why deferred:** Out of the competitive studio slice; high distraction cost.
- **Future phase:** Own product initiatives (e.g. SaaS launch marketing phase).

### B3. Marketing site redesign
- **From:** §3
- **What:** Public `gemorastudio`-style marketing homepage / pricing narrative redesign.
- **Why deferred:** Studio → share/embed path is the product gap; marketing site is a separate conversion project.
- **Future phase:** **Growth** (align with SaaS launch design Phase 3 landing work if still open).

### B4. Rebuild embed player from scratch
- **From:** §3
- **What:** New embed architecture, new player framework, or greenfield `/embed` stack.
- **Why deferred:** Existing embed URL/settings/iframe helpers (`src/lib/embed-settings.ts`, publish/embed routes) are sufficient; polish beats rewrite.
- **Future phase:** **Platform** only if current embed is proven broken (load failures, security, or unfixable UX after polish).

### B5. True 10,000 overnight enterprise batch factory
- **From:** §4 + competitive research (Gemora-scale overnight batch narrative)
- **What:** Farm that ingests thousands of CADs overnight with enterprise queueing, multi-tenant isolation, and SLA-grade throughput.
- **Why deferred:** Existing `batch_export` / `variants` / `render_jobs` cover jeweler catalog combos; 10k-scale is infra + ops, not the first competitive win.
- **Future phase:** **Platform** after batch UX polish proves demand and credit economics.

### B6. New billing / credits systems
- **From:** §4 / §5
- **What:** New credit ledgers, alternate billing products, or replacing Stripe/plan quotas for this slice.
- **Why deferred:** Billing already exists (`billing`, `ai_image_credits`, plan tiers). Slice must surface limits clearly, not reinvent metering.
- **Future phase:** **Growth** when packaging changes (new SKUs, usage-based GPU export packs).

### B7. Training custom AI models
- **From:** §5
- **What:** Fine-tuning brand-specific SDXL/LoRA or custom jewelry diffusion models.
- **Why deferred:** Costly, slow, and unnecessary for closing the Gemora lifestyle gap; stub + hosted API modes are enough.
- **Future phase:** **Category leap** for enterprise white-label brands only.

### B8. Full virtual try-on physics
- **From:** §5 + FEATURE-IDEAS #7 / #17
- **What:** MediaPipe/WebAR hand/face try-on, necklace drape physics, USDZ QuickLook pipelines as part of this upgrade.
- **Why deferred:** Different product surface (AR/physics) from gem realism + slim studio. AI on-model stills cover the near-term “no photoshoot” story.
- **Future phase:** **Category leap** (WebAR try-on / drape physics as dedicated phases).

### B9. Embed / batch / AI work inside Phase 1 gem shader
- **From:** §1 sequencing rule
- **What:** Shipping UI chrome, embed, batch, or AI in the same implementation PR train as the gem material swap.
- **Why deferred:** Ordered approach — gems must feel done before chrome/features dilute focus.
- **Future phase:** N/A (enforced by design sequencing; not a feature to build later).

---

## C. Competitive research — deferred product ideas

Pulled from Gemora/peer research and [`.planning/FEATURE-IDEAS.md`](../../../.planning/FEATURE-IDEAS.md). These are **not** in the five-phase upgrade.

### C1. Money / distribution (Tier 1 leftovers)
| Item | Why not now | Future phase |
|------|-------------|--------------|
| Live shopper configurator embed (full PDP configure) | Needs hardened slot swap + publish story beyond studio polish | **Growth** after §3 |
| Instant price engine (volume × spot metal) | Separate domain (pricing API + geometry mass) | **Category leap** |
| Marketplace listing pack (Amazon/Etsy/Shopify size packs) | Builds on export presets; not required to beat live gems | **Post-slice polish** / **Growth** |
| Shopify app | Partner OAuth + theme embed; distribution channel | **Growth** |
| Batch render farm at catalog-upload scale (200 CADs → listing packs) | Adjacent to B5; template + queue hardening | **Platform** |

### C2. Category breakers (Tier 2)
| Item | Why not now | Future phase |
|------|-------------|--------------|
| WebAR try-on | See B8 | **Category leap** |
| Auto slot detection ML | Heuristics exist; ML tagging is a research project | **Platform** |
| Path-traced beauty mode (WebGPU/server) | Offline ultra tier; preview–export parity uses same gem path first | **Platform** |
| Client proofing portal (3D comments) | Collaboration product, not Gemora parity | **Category leap** |
| Digital twin microsite | Extends publish; marketing/ops scope | **Growth** |
| Engraving preview | Upsell feature; not competitive P0 | **Post-slice polish** |

### C3. Steroids (Tier 3)
Sketch/photo-to-3D, gem grading simulator, auto video ads, multiplayer editing, melee scatter brush, headless render API, appraisal PDF, LLM product copy, patina/wear slider — all deferred to **Category leap** / **Platform**. None block beating Gemora’s live viewer or slim studio.

### C4. Industry blind spots (Tier 4)
DPP compliance, agentic commerce feeds (UCP/ACP/MCP), gram-budget optimizer, lab-grown dual-listing, live video consultation mode, resale/estate digitization, WhatsApp B2B, HUID linkage — deferred to **Category leap**. Schedule only with regulatory or GTM urgency, not as part of this upgrade.

---

## D. Explicitly in-scope reminder (do not re-defer)

For clarity, the following **are** in the companion design and must not be parked here:

1. Dedicated jewelry gem material (custom shader / `onBeforeCompile`) beating Gemora live fire/sparkle  
2. Slim primary IA: Metal · Gem · Light · Export (Share/Capture with Export); More/advanced for the rest  
3. First-class Share/Embed + 360 polish on existing flows  
4. Batch/variants UX polish on existing hooks (not 10k farm)  
5. AI Background primary + AI lifestyle/on-model secondary under one AI Visuals entry  

---

## E. Promotion checklist (when pulling an item forward)

- [ ] Write a one-page design with success criteria and non-goals  
- [ ] Name the existing modules it extends (no parallel stack)  
- [ ] Confirm it does not regress live gem quality or slim primary IA  
- [ ] Link the new design back to this backlog item ID (e.g. `B5`, `C1`)  
