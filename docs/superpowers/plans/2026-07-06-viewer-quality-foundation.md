# Viewer Quality Foundation Implementation Plan (Phase 1A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unit-test infrastructure, grow lighting presets from 3 to 5, and ship a user-overridable viewer quality selector (Auto/High/Balanced/Performance) that affects preview only — exports keep full fidelity.

**Architecture:** Pure domain logic lives in `src/lib/viewer-quality.ts` (testable, no React). A small Zustand store holds the chosen level. `ViewerCanvas` (dpr) and `ViewerPostFX` (effects) consume the resolved quality. `RenderFidelityBridge` (export path) is deliberately untouched — that is the "exports always full quality" guarantee. Lighting presets extend the existing `Record<LightingPresetId, …>` tables; TypeScript's exhaustiveness makes missed tables a compile error.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Zustand, Three.js/R3F, Vitest (new), lucide-react icons.

**Follow-up plans (not in this document):** 1B — server render service on serverless GPU + golden-image SSIM benchmark in CI. 1C — gem/metal/tone-mapping tuning against that benchmark + jeweler judgment gate (G1).

## Global Constraints

- TypeScript strict; zero `any`; no `@ts-ignore` (repo standard, `docs/CODE-STANDARDS.md`).
- Feature layout rules from `docs/ARCHITECTURE.md`: pure logic in `src/lib`, UI in `src/features/*/ui`, no domain logic in route handlers.
- Import via `@/` alias, feature barrels for cross-feature imports.
- All commands run from repo root: `/home/smitdesai/Coding/studio.devjewels.com/jewelry-renderer`.
- Existing type `PostFXQuality = "performance" | "low" | "medium" | "high" | "ultra"` from `src/lib/viewer-postfx-config.ts` — reuse, don't redefine.

---

### Task 1: Vitest infrastructure + 5 lighting presets

**Files:**
- Modify: `package.json` (add `test` script + devDependency)
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/viewer-lighting.test.ts`
- Modify: `src/stores/material-preset-store.ts:46` (extend `LightingPresetId`)
- Modify: `src/lib/viewer-lighting.ts` (all `Record<LightingPresetId, …>` tables)
- Modify: `src/features/viewer/ui/StudioSidebar.tsx:165-167` (lighting options list)
- Create (download): `public/hdr/brown_photostudio_02_1k.hdr`, `public/hdr/studio_small_08_1k.hdr`

**Interfaces:**
- Produces: `LightingPresetId = "studio" | "soft" | "dark" | "catalog" | "dramatic"` — consumed by every later lighting-aware task and by Plan 1B's render worker.

- [ ] **Step 1: Install Vitest and add config**

```bash
npm install -D vitest
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

Add to `package.json` scripts (keep existing scripts):

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/__tests__/viewer-lighting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  BG_BY_LIGHTING,
  HDR_FILE_BY_LIGHTING,
} from "@/lib/viewer-lighting";

const ALL_PRESETS = ["studio", "soft", "dark", "catalog", "dramatic"] as const;

describe("lighting presets", () => {
  it("defines every preset in every lookup table", () => {
    for (const id of ALL_PRESETS) {
      expect(HDR_FILE_BY_LIGHTING[id], `HDR for ${id}`).toBeTruthy();
      expect(BG_BY_LIGHTING[id], `background for ${id}`).toBeTruthy();
    }
  });

  it("points every preset at an HDR file that exists on disk", () => {
    for (const id of ALL_PRESETS) {
      const rel = HDR_FILE_BY_LIGHTING[id];
      const abs = path.join(process.cwd(), "public", rel);
      expect(existsSync(abs), `${rel} missing from public/`).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/viewer-lighting.test.ts`
Expected: FAIL — TypeScript rejects `"catalog"`/`"dramatic"` indexing (not in `LightingPresetId`).

- [ ] **Step 4: Extend the type**

In `src/stores/material-preset-store.ts` line 46:

```ts
export type LightingPresetId = "studio" | "soft" | "dark" | "catalog" | "dramatic";
```

- [ ] **Step 5: Extend every lighting table**

Run `npx tsc --noEmit` — every `Record<LightingPresetId, …>` in `src/lib/viewer-lighting.ts` now errors, which enumerates exactly the tables to fill. Add these entries (for any table not listed below, copy the `studio` row's value unchanged):

```ts
// ENV_BY_LIGHTING
catalog: "studio",
dramatic: "night",

// HDR_FILE_BY_LIGHTING
catalog: "/hdr/brown_photostudio_02_1k.hdr",
dramatic: "/hdr/studio_small_08_1k.hdr",

// BG_BY_LIGHTING  — bright catalog neutral / deep charcoal
catalog: "#F4F1EA",
dramatic: "#1E1E23",

// AMBIENT_BY_LIGHTING
catalog: 0.38,
dramatic: 0.16,

// SPOT_BY_LIGHTING
catalog: 1.25,
dramatic: 1.4,
```

- [ ] **Step 6: Download the two HDRIs (CC0, Poly Haven)**

```bash
curl -L -o public/hdr/brown_photostudio_02_1k.hdr \
  "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/brown_photostudio_02_1k.hdr"
curl -L -o public/hdr/studio_small_08_1k.hdr \
  "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr"
ls -la public/hdr/
```

Expected: both files present, each roughly 1–2 MB.

- [ ] **Step 7: Add the presets to the sidebar UI**

In `src/features/viewer/ui/StudioSidebar.tsx`, the options array at lines 165–167 currently reads:

```ts
  { id: "studio", label: "Studio", icon: Sun },
  { id: "soft", label: "Soft", icon: SunDim },
  { id: "dark", label: "Low key", icon: Moon },
```

Append (and add `Camera, Sparkles` to the existing `lucide-react` import):

```ts
  { id: "catalog", label: "Catalog", icon: Camera },
  { id: "dramatic", label: "Dramatic", icon: Sparkles },
```

- [ ] **Step 8: Check backend accepts the new ids**

```bash
grep -rn "studio\|soft\|dark" backend/app/schemas/scene.py backend/app/features/scene/service.py
```

If a `Literal["studio", "soft", "dark"]` (or equivalent validation) appears, extend it with `"catalog", "dramatic"`. If nothing constrains lighting values, no backend change.

- [ ] **Step 9: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both PASS.

- [ ] **Step 10: Manual smoke** — `docker compose up postgres backend -d && npm run dev`, open a scene, switch to Catalog and Dramatic; both render with distinct lighting and background.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/__tests__/viewer-lighting.test.ts \
  src/stores/material-preset-store.ts src/lib/viewer-lighting.ts \
  src/features/viewer/ui/StudioSidebar.tsx public/hdr/*.hdr
git commit -m "feat: add catalog + dramatic lighting presets; vitest infra"
```

---

### Task 2: Quality domain module (pure logic, TDD)

**Files:**
- Create: `src/lib/viewer-quality.ts`
- Test: `src/lib/__tests__/viewer-quality.test.ts`

**Interfaces:**
- Consumes: `PostFXQuality`, `ViewerPostFXConfig` from `@/lib/viewer-postfx-config`.
- Produces (used by Tasks 3–5):
  - `type QualityLevel = "auto" | "high" | "balanced" | "performance"`
  - `type QualityTier = "high" | "balanced" | "performance"`
  - `type DeviceCaps = { deviceMemoryGb?: number; hardwareConcurrency?: number; isMobile: boolean }`
  - `type EffectiveQuality = { tier: QualityTier; dprCap: number; postfxEnabled: boolean; aoQuality: PostFXQuality; aoHalfRes: boolean }`
  - `detectDeviceTier(caps: DeviceCaps): QualityTier`
  - `resolveEffectiveQuality(level: QualityLevel, caps: DeviceCaps): EffectiveQuality`
  - `applyQualityToPostFX(config: ViewerPostFXConfig, q: EffectiveQuality): ViewerPostFXConfig`
  - `readDeviceCaps(): DeviceCaps` (browser-only; SSR-safe fallback)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/viewer-quality.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyQualityToPostFX,
  detectDeviceTier,
  resolveEffectiveQuality,
} from "@/lib/viewer-quality";
import { DEFAULT_VIEWER_POSTFX } from "@/lib/viewer-postfx-config";

describe("detectDeviceTier", () => {
  it("strong desktop → high", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 12, deviceMemoryGb: 16, isMobile: false })).toBe("high");
  });
  it("mid desktop → balanced", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 4, deviceMemoryGb: 8, isMobile: false })).toBe("balanced");
  });
  it("weak machine → performance", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 2, deviceMemoryGb: 2, isMobile: false })).toBe("performance");
  });
  it("modern phone → balanced", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 8, deviceMemoryGb: 6, isMobile: true })).toBe("balanced");
  });
  it("low-memory phone → performance", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 4, deviceMemoryGb: 2, isMobile: true })).toBe("performance");
  });
  it("unknown caps → balanced (safe middle)", () => {
    expect(detectDeviceTier({ isMobile: false })).toBe("balanced");
  });
});

describe("resolveEffectiveQuality", () => {
  const weak = { hardwareConcurrency: 2, deviceMemoryGb: 2, isMobile: false };
  it("explicit level overrides device detection", () => {
    expect(resolveEffectiveQuality("high", weak).tier).toBe("high");
  });
  it("auto follows device detection", () => {
    expect(resolveEffectiveQuality("auto", weak).tier).toBe("performance");
  });
  it("high tier: full dpr + full effects", () => {
    const q = resolveEffectiveQuality("high", weak);
    expect(q).toEqual({ tier: "high", dprCap: 2, postfxEnabled: true, aoQuality: "high", aoHalfRes: false });
  });
  it("performance tier: dpr 1, postfx off", () => {
    const q = resolveEffectiveQuality("performance", weak);
    expect(q).toEqual({ tier: "performance", dprCap: 1, postfxEnabled: false, aoQuality: "performance", aoHalfRes: true });
  });
});

describe("applyQualityToPostFX", () => {
  it("high tier leaves config untouched (export-parity identity)", () => {
    const q = resolveEffectiveQuality("high", { isMobile: false });
    expect(applyQualityToPostFX(DEFAULT_VIEWER_POSTFX, q)).toEqual(DEFAULT_VIEWER_POSTFX);
  });
  it("balanced tier downgrades AO but keeps effects on", () => {
    const q = resolveEffectiveQuality("balanced", { isMobile: false });
    const out = applyQualityToPostFX(DEFAULT_VIEWER_POSTFX, q);
    expect(out.aoEnabled).toBe(DEFAULT_VIEWER_POSTFX.aoEnabled);
    expect(out.ao.quality).toBe("medium");
    expect(out.ao.halfRes).toBe(true);
  });
  it("performance tier disables AO entirely", () => {
    const q = resolveEffectiveQuality("performance", { isMobile: false });
    expect(applyQualityToPostFX(DEFAULT_VIEWER_POSTFX, q).aoEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/viewer-quality.test.ts`
Expected: FAIL — module `@/lib/viewer-quality` not found.

- [ ] **Step 3: Implement**

Create `src/lib/viewer-quality.ts`:

```ts
import type { PostFXQuality, ViewerPostFXConfig } from "@/lib/viewer-postfx-config";

export type QualityLevel = "auto" | "high" | "balanced" | "performance";
export type QualityTier = Exclude<QualityLevel, "auto">;

export type DeviceCaps = {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  isMobile: boolean;
};

export type EffectiveQuality = {
  tier: QualityTier;
  dprCap: number;
  postfxEnabled: boolean;
  aoQuality: PostFXQuality;
  aoHalfRes: boolean;
};

const TIER_SETTINGS: Record<QualityTier, Omit<EffectiveQuality, "tier">> = {
  high: { dprCap: 2, postfxEnabled: true, aoQuality: "high", aoHalfRes: false },
  balanced: { dprCap: 1.5, postfxEnabled: true, aoQuality: "medium", aoHalfRes: true },
  performance: { dprCap: 1, postfxEnabled: false, aoQuality: "performance", aoHalfRes: true },
};

/** Conservative heuristics — unknown values fall to the safe middle. */
export function detectDeviceTier(caps: DeviceCaps): QualityTier {
  const mem = caps.deviceMemoryGb;
  const cores = caps.hardwareConcurrency;
  if (mem !== undefined && mem < 4) return "performance";
  if (cores !== undefined && cores <= 2) return "performance";
  if (caps.isMobile) return "balanced";
  if (mem !== undefined && mem >= 8 && cores !== undefined && cores >= 8) return "high";
  return "balanced";
}

export function resolveEffectiveQuality(level: QualityLevel, caps: DeviceCaps): EffectiveQuality {
  const tier = level === "auto" ? detectDeviceTier(caps) : level;
  return { tier, ...TIER_SETTINGS[tier] };
}

/**
 * Viewport-only degradation. High tier is the identity — this is the
 * export-parity guarantee: export paths never call this function, and even
 * if they did at high tier, output would be unchanged.
 */
export function applyQualityToPostFX(
  config: ViewerPostFXConfig,
  q: EffectiveQuality,
): ViewerPostFXConfig {
  if (q.tier === "high") return config;
  if (!q.postfxEnabled) return { ...config, aoEnabled: false };
  return {
    ...config,
    ao: { ...config.ao, quality: q.aoQuality, halfRes: q.aoHalfRes },
  };
}

/** Browser caps snapshot; SSR-safe. */
export function readDeviceCaps(): DeviceCaps {
  if (typeof navigator === "undefined") return { isMobile: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemoryGb: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    isMobile: /Android|iPhone|iPad|Mobile/i.test(nav.userAgent),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/viewer-quality.ts src/lib/__tests__/viewer-quality.test.ts
git commit -m "feat: viewer quality domain — tiers, device detection, postfx mapping"
```

---

### Task 3: Quality store + viewport wiring

**Files:**
- Create: `src/stores/viewer-quality-store.ts`
- Modify: `src/features/viewer/ui/ViewerCanvas.tsx:138` (dpr)
- Modify: `src/features/viewer/ui/ViewerPostFX.tsx` (apply quality to viewport config)

**Interfaces:**
- Consumes: `resolveEffectiveQuality`, `readDeviceCaps`, `applyQualityToPostFX`, types from Task 2.
- Produces: `useViewerQualityStore` with `{ level: QualityLevel; effective: EffectiveQuality; setLevel(level: QualityLevel): void }` — consumed by Task 4's UI.

- [ ] **Step 1: Create the store**

Create `src/stores/viewer-quality-store.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type EffectiveQuality,
  type QualityLevel,
  readDeviceCaps,
  resolveEffectiveQuality,
} from "@/lib/viewer-quality";

type ViewerQualityState = {
  level: QualityLevel;
  effective: EffectiveQuality;
  setLevel: (level: QualityLevel) => void;
};

export const useViewerQualityStore = create<ViewerQualityState>()(
  persist(
    (set) => ({
      level: "auto",
      effective: resolveEffectiveQuality("auto", readDeviceCaps()),
      setLevel: (level) =>
        set({ level, effective: resolveEffectiveQuality(level, readDeviceCaps()) }),
    }),
    {
      name: "viewer-quality",
      partialize: (state) => ({ level: state.level }),
      onRehydrateStorage: () => (state) => {
        // recompute effective for THIS device; only the chosen level persists
        state?.setLevel(state.level);
      },
    },
  ),
);
```

- [ ] **Step 2: Cap Canvas dpr**

In `src/features/viewer/ui/ViewerCanvas.tsx`: import the store, read `const dprCap = useViewerQualityStore((s) => s.effective.dprCap);` inside the component, and change line 138 from `dpr={[1, 2]}` to:

```tsx
dpr={[1, dprCap]}
```

- [ ] **Step 3: Apply quality to viewport post-processing**

In `src/features/viewer/ui/ViewerPostFX.tsx`, locate where the component resolves its config (`resolvePostFXConfig(...)` — confirm with `grep -n "resolvePostFXConfig" src/features/viewer/ui/ViewerPostFX.tsx`). Wrap the resolved config:

```tsx
import { applyQualityToPostFX } from "@/lib/viewer-quality";
import { useViewerQualityStore } from "@/stores/viewer-quality-store";
// inside component:
const effective = useViewerQualityStore((s) => s.effective);
const config = applyQualityToPostFX(resolvePostFXConfig(advanced), effective);
```

Do NOT touch `src/features/render/ui/RenderFidelityBridge.tsx` — the export path stays full fidelity.

- [ ] **Step 4: Verify export path untouched**

```bash
grep -rn "viewer-quality" src/features/render/
```

Expected: no matches. This is the "exports always full quality" invariant — record it in the commit message.

- [ ] **Step 5: Tests + typecheck + manual smoke**

Run: `npx vitest run && npx tsc --noEmit` — PASS.
Manual: in dev, set store level via UI-less check — temporarily run `localStorage.setItem("viewer-quality", JSON.stringify({state:{level:"performance"},version:0}))` in the browser console, reload, confirm viewport looks flatter (no AO) but stills exported via the existing export button remain full quality.

- [ ] **Step 6: Commit**

```bash
git add src/stores/viewer-quality-store.ts src/features/viewer/ui/ViewerCanvas.tsx src/features/viewer/ui/ViewerPostFX.tsx
git commit -m "feat: wire quality tiers into viewport dpr + postfx; export path untouched"
```

---

### Task 4: Quality selector UI

**Files:**
- Create: `src/features/viewer/ui/QualityMenu.tsx`
- Modify: `src/features/viewer/ui/StudioTopBar.tsx` (mount the menu)

**Interfaces:**
- Consumes: `useViewerQualityStore` (Task 3), `QualityLevel` (Task 2), shadcn `DropdownMenu` primitives from `@/components/ui/dropdown-menu`.

- [ ] **Step 1: Build the menu component**

Create `src/features/viewer/ui/QualityMenu.tsx`:

```tsx
"use client";

import { Gauge } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { QualityLevel } from "@/lib/viewer-quality";
import { useViewerQualityStore } from "@/stores/viewer-quality-store";

const LABELS: Record<QualityLevel, string> = {
  auto: "Auto",
  high: "High",
  balanced: "Balanced",
  performance: "Performance",
};

/** Preview quality only — exports always render at full quality. */
export function QualityMenu() {
  const level = useViewerQualityStore((s) => s.level);
  const effective = useViewerQualityStore((s) => s.effective);
  const setLevel = useViewerQualityStore((s) => s.setLevel);

  const label = level === "auto" ? `Auto (${LABELS[effective.tier]})` : LABELS[level];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Preview quality">
          <Gauge className="size-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={level}
          onValueChange={(v) => setLevel(v as QualityLevel)}
        >
          {(Object.keys(LABELS) as QualityLevel[]).map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              {LABELS[id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

If `@/components/ui/dropdown-menu` does not exist (`ls src/components/ui/dropdown-menu.tsx`), add it with `npx shadcn@latest add dropdown-menu`.

- [ ] **Step 2: Mount in the top bar**

In `src/features/viewer/ui/StudioTopBar.tsx`, find the right-hand control cluster (`grep -n "flex" src/features/viewer/ui/StudioTopBar.tsx | head` to locate the actions container) and add `<QualityMenu />` beside the existing controls, importing from `./QualityMenu`.

- [ ] **Step 3: Typecheck + lint + manual smoke**

Run: `npx tsc --noEmit && npm run lint`
Manual: menu shows "Auto (High)" (or device tier), switching to Performance visibly simplifies the viewport, choice survives reload, export still full quality.

- [ ] **Step 4: Commit**

```bash
git add src/features/viewer/ui/QualityMenu.tsx src/features/viewer/ui/StudioTopBar.tsx
git commit -m "feat: preview quality selector in studio top bar"
```

---

### Task 5: Guard rails — CI test run + invariant test

**Files:**
- Modify: `package.json` (chain test into an existing verify script if present)
- Create: `src/lib/__tests__/export-parity.test.ts`

- [ ] **Step 1: Write the export-parity invariant test**

Create `src/lib/__tests__/export-parity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Invariant: the export/render feature must never import viewer quality
 * degradation. Exports are always full fidelity regardless of preview setting.
 */
describe("export parity invariant", () => {
  it("render feature does not depend on viewer-quality", () => {
    const dir = path.join(process.cwd(), "src/features/render");
    const files = ["ui/RenderFidelityBridge.tsx", "ui/HiresExportBridge.tsx", "ui/ScreenshotBridge.tsx"];
    for (const f of files) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src.includes("viewer-quality"), `${f} must not import viewer-quality`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/export-parity.test.ts package.json
git commit -m "test: export-parity invariant — render feature never degrades quality"
```

---

## Done criteria (maps to spec §7 Phase 1)

- 5 lighting presets selectable and visually distinct ✅ Task 1
- Quality selector Auto/High/Balanced/Performance, preview-only ✅ Tasks 2–4
- Exports unaffected by preview quality (tested invariant) ✅ Task 5
- Unit test infrastructure in place for Plans 1B/1C ✅ Task 1

**Next plans:** 1B server render service + golden-image SSIM CI; 1C material tuning + jeweler gate (G1).
