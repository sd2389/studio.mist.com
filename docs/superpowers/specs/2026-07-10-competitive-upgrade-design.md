# Competitive Upgrade Design — Beat Gemora (Ordered Full Slice)

**Date:** 2026-07-10  
**Status:** Approved for planning (ordered approach 2 / full slice C)  
**Owner:** Smit Desai  
**Deferred work:** [`docs/superpowers/backlogs/2026-07-10-competitive-upgrade-later.md`](../backlogs/2026-07-10-competitive-upgrade-later.md)  
**Architecture rules:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/CODE-STANDARDS.md`](../../CODE-STANDARDS.md)

---

## 1. Overview

Upgrade DevJewels Studio so the **interactive jewelry viewer clearly beats Gemora** on gem fire/sparkle, while the studio chrome stays **minimal and Gemora-simple**. Ship the full competitive slice in a hard order — not a big bang — so diamonds never ship looking like glass and the UI never re-accumulates dense sidebar clutter.

**Locked decisions**

| Decision | Choice |
|----------|--------|
| Success bar | Beat Gemora in the interactive viewer (stronger fire/sparkle; heavier GPU OK) |
| Scope | Full slice C: gems + slim UI + embed/360 + batch/variants + AI lifestyle/models |
| Sequencing | (1) gem shader → (2) slim Metal/Gem/Light/Export UI → (3) embed/share + 360 → (4) batch/variants polish → (5) AI lifestyle/models |
| Approach | Ordered full slice; each phase must feel done before the next starts |

**Non-goals for this design** are listed in the backlog file (param-only glass as long-term solution, 10k overnight batch farm, new billing systems, marketing site redesign, embed rewrite, custom model training, full try-on physics, AI stills replacing realtime gems, new dashboards/card grids, unrelated page rewrites, Tier 2–4 feature ideas).

---

## 2. Success criteria

All must pass before calling the upgrade complete:

1. **Live gems beat Gemora** — Side-by-side on the same class of piece (round brilliant diamond + metal band), non-expert reviewers stop calling ours “glass” and prefer our fire/facet flash in orbit. Interactive quality is the bar; exports use the same material path.
2. **Minimal primary IA** — First studio viewport job is: see the piece, change Metal / Gem / Light, Export (with Capture/Share). Advanced controls live under More; no permanent dense control panel competing with the viewport.
3. **Share story under one minute** — From a finished look, a designer reaches a working share link, embed snippet, or 360 capture without hunting nested Scene menus.
4. **Batch/variants usable** — Pick combos → generate → review → export with visible progress, failures, and plan limits; flow is secondary (not permanent sidebar clutter).
5. **AI Visuals one entry** — AI Background primary; lifestyle/on-model secondary; results use the same gem/metal materials as the live viewer; stub/dev mode remains usable without GPU backends.
6. **No regressions** — Metals still use `MeshPhysicalMaterial`; `GEM_CONFIGS` / preset IDs preserved; existing publish/embed/billing/quota paths keep working; TypeScript and backend tests that touch materials/export/AI still pass.

---

## 3. Current baseline (what we change)

| Area | Today | Change |
|------|-------|--------|
| Gems | `createGemMaterial` in `src/lib/gem-gpu/gem-physical-material.ts` builds `MeshPhysicalMaterial` from `GEM_CONFIGS` (transmission glass) | Replace **rendering implementation** with dedicated jewelry gem material; keep configs/IDs |
| Metals | `MeshPhysicalMaterial` via `src/lib/material-presets.ts` | Unchanged |
| Facet normals | Procedural cuts in `src/lib/stones/cut-geometries.ts` already flat-shade; CAD gems may still smooth | Ensure CAD gem meshes get faceted normals where needed |
| Studio chrome | Dense `StudioSidebar` tabs (materials grids, scene buckets, export/share buried) | Primary Metal · Gem · Light · Export; collapse rest into More |
| Embed/360 | `embed-settings`, publish/embed routes, `VideoCaptureBridge` exist | Surface + polish; no new architecture |
| Batch/variants | `src/lib/variants/batch-export.ts`, batch stores, feature flags | UX/reliability polish only |
| AI | `EditorAiImageTab`, `ai_background` / `ai_on_model` flags, `AI_BACKGROUND_MODE` | One AI Visuals entry; harden lifestyle/on-model as secondary |

---

## 4. Architecture

### 4.1 Principles (KISS / SRP / modular)

- **Feature ownership:** Viewer UI stays under `src/features/viewer`; render/capture under `src/features/render`; AI image UI under editor/viewer composition; gem GPU math under `src/lib/gem-gpu` (shared technical lib used by viewer + export).
- **One function, one job:** Shader chunk assembly, config→uniform mapping, mesh normal prep, and React chrome are separate modules.
- **No parallel stacks:** Do not invent a second material system, second embed player, or second batch queue.
- **WYSIWYG:** Interactive viewer and export/offscreen paths call the same `createGemMaterial` (or successor factory) so stills/360/AI captures inherit live look.
- **Heavier GPU OK for gems:** Prefer visual quality over lowest-end GPU; keep a single quality fallback (disable expensive sparkle passes) rather than a second “cheap glass” material.

### 4.2 Layer diagram

```
Route / studio page
  └─ Viewer feature UI (slim chrome: Metal | Gem | Light | Export | More)
       ├─ material-preset-store / slot selections
       ├─ apply-material-preset → createPresetMaterial / createGemMaterial
       │     ├─ metals → MeshPhysicalMaterial (unchanged)
       │     └─ gems → JewelryGemMaterial (new; reads GEM_CONFIGS)
       ├─ ViewerCanvas (R3F) + env/lights
       ├─ Export / Share / 360 / AI Visuals panels (composed, not always-on)
       └─ variants/batch hooks → offscreen-render / VideoCaptureBridge
```

Backend remains thin adapters: existing publish/embed, billing credits, AI background route (`app/api/ai-background` + FastAPI AI features). No new billing schema in this design.

### 4.3 Gem material architecture (Phase 1)

**Public factory (stable API)**

- Keep callers on `createGemMaterial(presetId)` from `@/lib/gem-gpu/gem-physical-material` (or a thin re-export from a new `jewelry-gem-material.ts` if the file is split for SRP).
- Preserve `GEM_GPU_USER_KEY`, `isGemGpuMaterial`, `gemPresetIdFromMaterial`.
- Preserve all `GemPresetId` values in `GEM_CONFIGS`; add shader-facing fields only if needed (e.g. `sparkleStrength`) with defaults so existing presets keep working.

**Implementation choice**

- Primary: Three.js material with `onBeforeCompile` (or `ShaderMaterial` subclass) that starts from physical lighting but injects:
  - **Facet-aware shading** — respect flat/faceted normals; sharp specular lobes per facet.
  - **Env sparkle** — high-frequency env/cubemap sampling modulated by facet normal vs view; animated micro-glints on orbit (time uniform optional, subtle).
  - **Stronger dispersion / fire** — spectral offset approximation beyond stock `MeshPhysicalMaterial.dispersion` (RGB-split refraction or chromatic specular lobes driven by `dispersionBase` / `dispersionAmplitude`).
  - **Multi-bounce-ish internal reflection** — cheap approximation (thickness + attenuation + internal Fresnel lobe / dual specular), not full path tracing.
- Metals never enter this path.

**Mesh prep**

- Shared helper `ensureFacetedGemNormals(geometry)` (or extend existing flat-shade utility from `cut-geometries.ts` into `src/lib/gem-gpu/` or `src/lib/stones/`) applied when assigning gem materials to CAD meshes that still have smoothed normals.
- Procedural stone geometries already flat-shaded; do not double-process destructively.

**Quality fallback**

- One boolean/uniform path: if `RenderQualityMode` is Performance (or device fails a simple capability check), reduce sparkle taps / disable secondary internal lobe; still use the jewelry gem material (never silently fall back to stock glass physical-only).

### 4.4 Slim UI architecture (Phase 2)

Split today’s monolithic `StudioSidebar.tsx` responsibilities without inventing a new design system:

| Module (SRP) | Responsibility |
|--------------|----------------|
| `StudioPrimaryBar` (or equivalent) | Metal · Gem · Light · Export triggers only |
| `MetalPickerPanel` / `GemPickerPanel` | Preset swatches + slot targeting; reuse `MATERIAL_GROUPS` / gem lists |
| `LightPickerPanel` | Lighting presets only |
| `ExportSharePanel` | Capture still, hi-res, share link, embed snippet, 360 entry |
| `StudioMoreDrawer` | Scene buckets, advanced quality, deep grids, finishes, library — everything else |

Keep existing tokens (`components/ui/*`). No new dashboards or card-grid marketing chrome in-studio.

### 4.5 Embed / share / 360 (Phase 3)

- Reuse `buildEmbedUrl`, `buildEmbedIframeSnippet`, `resolveEmbedSettings` in `src/lib/embed-settings.ts`.
- Surface Share/Embed and 360 as first-class actions inside Export/Share (not buried under Scene).
- 360 continues through existing `VideoCaptureBridge` / video capture store; polish copy, progress, and failure messages.
- Rebuild player only if polish cannot fix broken loads (then promote backlog B4).

### 4.6 Batch / variants (Phase 4)

- Build on `buildBatchExportJobs` / `runBatchExportJobs` in `src/lib/variants/batch-export.ts` and existing stores.
- UX flow: select metal×gem×light combos → generate → review grid → export winners.
- Progress, per-job failure, and credit/plan limits must be visible; no silent stalls.
- Entry from More or a focused secondary sheet — not a permanent primary-bar tab.

### 4.7 AI lifestyle / models (Phase 5)

- Single **AI Visuals** entry from Export/Share area.
- Primary: AI Background (existing shoot/custom paths).
- Secondary: Model / on-model (`ai_on_model`, `EditorAiImageTab` model sub-mode).
- Capture transparent PNG from the live viewer (same materials) → existing `requestAiImage` / API route.
- `AI_BACKGROUND_MODE=stub` remains valid for local/dev; show clear “stub result” status, not a fake success that looks production-ready without labeling.

---

## 5. Data flow

### 5.1 Material apply (interactive)

1. User selects Metal or Gem preset for a slot (or global default).
2. `material-preset-store` / slot map updates.
3. `apply-material-preset` (or equivalent) resolves preset → `createGemMaterial` / metal factory.
4. Mesh materials replaced; gem meshes run facet-normal ensure once.
5. R3F re-renders with env map + lighting preset; gem uniforms update on preset change.

### 5.2 Export / 360

1. User opens Export → Capture / Hi-res / 360.
2. Offscreen or bridge path reads current scene graph (same materials).
3. Still: `renderAtResolution` / hi-res refs; 360: frame orbit + mux via existing video path.
4. Failure: toast/inline error; no credit debit on hard failure when billing applies.

### 5.3 Share / embed

1. User opens Share/Embed from Export area.
2. Resolve embed key (`sku` or `viewerId`) → `buildEmbedUrl` / iframe snippet.
3. Copy-to-clipboard; optional open public share page.
4. Stored `EmbedSettings` on model config remain source of truth; URL params override for demos.

### 5.4 Batch variants

1. User picks combo matrix (metals × gems × optional lights).
2. `buildBatchExportJobs` expands jobs; UI shows count and estimated limits.
3. `runBatchExportJobs` applies config, waits for model ready, renders each job.
4. Review grid lists successes/failures; user exports or shares winners.

### 5.5 AI Visuals

1. User opens AI Visuals → Background or Model.
2. Transparent capture from viewer → `requestAiImage` with preset/prompt.
3. Credits checked via existing billing/AI credit stores; insufficient credits block with upgrade CTA.
4. Result URL shown for download/open; errors surfaced inline.

---

## 6. Error handling

| Failure | User-visible behavior | System behavior |
|---------|----------------------|-----------------|
| Gem shader compile fail | “Gem preview unavailable — retrying safe mode” once; then reduced jewelry-gem path | Log compile error; do not leave pink/error material silently |
| Weak GPU / Performance mode | Slightly less sparkle; gems still look like gems | Toggle uniform/defines; no glass fallback |
| Export/360 fail | Inline error + retry | No silent hang; clear busy state |
| Embed key missing / unpublished | Explain publish/share prerequisite | Do not generate dead iframe URLs |
| Batch job fail mid-run | Mark that job failed; continue others when safe | Aggregate summary at end |
| AI backend down / stub | Labeled stub or actionable error | Never charge credits for hard upstream failure |
| Out of AI/export credits | Block with remaining count + billing path | Use existing credit stores |

---

## 7. Testing strategy

### 7.1 Phase 1 (gems)

- **Unit:** `createGemMaterial` returns material tagged with `GEM_GPU_USER_KEY` and correct preset id for every `GEM_PRESET_IDS` sample (at least diamond, moissanite, ruby, sapphire, emerald, pearl).
- **Unit:** `ensureFacetedGemNormals` produces non-indexed (or per-face) normals on a smoothed box/sphere fixture.
- **Visual / golden:** Extend or add viewer golden-image cases for diamond + metal band under fixed camera/light (see existing golden-image plan). Threshold may need recalibration after intentional look change — update goldens deliberately, do not weaken CI blindly.
- **Manual:** Side-by-side Gemora vs DevJewels orbit on round brilliant; checklist: facet flash, fire on tilt, no milky glass ball.

### 7.2 Phase 2 (UI)

- **Component:** Primary bar exposes exactly Metal, Gem, Light, Export (and More); advanced scene buckets not visible until More opens.
- **Manual:** Cold open studio with a model — change metal, gem, light, export still in under 30 seconds without opening More.

### 7.3 Phase 3 (embed/360)

- **Unit:** `buildEmbedUrl` / snippet helpers unchanged contract; settings round-trip via query params.
- **Manual:** Copy embed → paste into blank HTML → viewer loads; 360 completes or fails with clear error under 1 minute path from Export.

### 7.4 Phase 4 (batch)

- **Unit:** `buildBatchExportJobs` expands expected cartesian size; `runBatchExportJobs` restores prior model config after run (existing restore behavior preserved).
- **Manual:** 2×2 metal/gem batch shows 4 review tiles; one forced failure still completes the rest.

### 7.5 Phase 5 (AI)

- **Manual / integration:** Stub mode returns labeled result; live mode (when configured) consumes one AI credit on success only.
- **Regression:** Transparent capture still includes new gem material look (spot-check diamond fire in capture).

### 7.6 Cross-cutting

- `npx tsc --noEmit` clean for touched packages.
- Backend pytest for any AI/billing route touched (no new billing system).
- Do not commit secrets; AI keys stay in env examples only.

---

## 8. Ordered phases

Each phase has an exit gate. Do not start the next phase’s implementation plan until the gate passes.

### Phase 1 — Diamond / gem realism (P0)

**Goal:** Live gems beat Gemora on fire, sparkle, and facet read.

**Work**

- Implement jewelry gem material; wire through `createGemMaterial` / `apply-material-preset` / library gem params path (`createGemMaterialFromParams` must map onto the new material or a documented subset for custom library gems).
- Faceted normals for CAD gem meshes.
- Quality fallback uniforms; metals untouched.
- Update goldens after intentional look change.

**Exit gate:** Success criterion 1 (live gems beat Gemora) + unit tags/presets green.

**Out of phase:** UI chrome, embed, batch, AI (see backlog).

### Phase 2 — Minimal Gemora-like UI

**Goal:** Big viewport, tiny chrome.

**Work**

- Extract/slim primary controls: Metal · Gem · Light · Export (Capture/Share with Export).
- Move dense `StudioSidebar` content into More/advanced.
- Keep design tokens; declutter IA only.

**Exit gate:** Success criterion 2 + 30-second metal/gem/light/export manual path.

**Out of phase:** New dashboards, card grids, marketing chrome, unrelated pages.

### Phase 3 — Embed / share + 360

**Goal:** Studio → online without a photoshoot, under one minute.

**Work**

- First-class Share/Embed + 360 next to Export.
- Polish copy, steps, clipboard, progress/errors on existing flows.

**Exit gate:** Success criterion 3.

**Out of phase:** Marketing site redesign; embed player rewrite.

### Phase 4 — Batch / variants polish

**Goal:** Combo → generate → review → export feels easy and trustworthy.

**Work**

- UX on existing hooks; progress/failures/limits; secondary entry point.

**Exit gate:** Success criterion 4.

**Out of phase:** 10k overnight enterprise batch; new billing systems.

### Phase 5 — AI lifestyle / models

**Goal:** Marketing visuals without a photoshoot; one AI Visuals entry.

**Work**

- AI Background primary; lifestyle/on-model secondary; same live materials; stub OK.

**Exit gate:** Success criterion 5.

**Out of phase:** Custom model training; full try-on physics; AI replacing realtime gems.

---

## 9. File / module touch map (concrete, not exhaustive)

| Concern | Primary locations |
|---------|-------------------|
| Gem configs (data) | `src/lib/gem-gpu/gem-configs.ts` |
| Gem material factory | `src/lib/gem-gpu/gem-physical-material.ts` (+ new shader module if split) |
| Apply presets | `src/lib/apply-material-preset.ts`, `src/lib/material-presets.ts` |
| Library gem params | `src/lib/library/create-material-from-params.ts` |
| Facet normals | `src/lib/stones/cut-geometries.ts` patterns → shared gem-gpu/stones helper |
| Studio chrome | `src/features/viewer/ui/StudioSidebar.tsx` → split panels |
| Embed helpers | `src/lib/embed-settings.ts`, publish/embed routes |
| 360 | `src/features/render/ui/VideoCaptureBridge.tsx`, video capture store |
| Batch | `src/lib/variants/batch-export.ts`, batch-export store |
| AI | `src/features/editor/ui/EditorAiImageTab.tsx`, `src/lib/ai-image-api.ts`, AI API routes |
| Flags | `src/lib/feature-flags/types.ts` (`embed`, `ai_background`, `ai_on_model`, `batch_export`, `variants`) |

---

## 10. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Shader complexity blows past KISS | Cap features to facet normals + env sparkle + fire + one internal lobe; no path tracer in-browser |
| UI split regresses power users | Everything remains under More; no feature deletion in Phase 2 |
| Golden images all fail after gem change | Treat as expected; regenerate with review, keep SSIM discipline |
| Phase coupling (UI before gems) | Hard order; gems gate UI work |
| Scope creep from FEATURE-IDEAS | Redirect to backlog; do not expand this design |

---

## 11. Self-review notes (resolved)

- **No TBD/TODO placeholders** in this document; open product questions were locked in brainstorming (success bar B, full slice C, ordered approach 2, §1–§5 approved).
- **Contradiction check:** SaaS launch design (2026-07-03) mentioned server-side export GPU as a longer launch track; this upgrade requires **preview–export material parity** via the same client material factory. Server export farm work remains outside this slice unless already present — do not block Phase 1 on Modal/RunPod. If a server renderer exists later, it must load the same gem factory.
- **Ambiguity removed:** “Beat Gemora” means interactive viewer preference on fire/facet/sparkle, not marketing-site parity or 10k batch parity.
- **Scope boundary:** Full slice C is five ordered phases with exit gates; deferred items live only in the backlog file.
- **Secrets:** No credentials in this spec or backlog; Gemora research credentials must never be committed.

---

## 12. Next step after approval of this written spec

1. User reviews this design + backlog.  
2. Only then: writing-plans for Phase 1 (gem shader), then implement Phase 1.  
3. Repeat plan → implement → gate for Phases 2–5.  
