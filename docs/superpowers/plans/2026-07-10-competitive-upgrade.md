# Competitive Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the ordered competitive upgrade so live gems beat Gemora on fire/sparkle, studio chrome is Metal · Gem · Light · Export (+ More), and embed/360, batch/variants, and AI Visuals are first-class polish on existing paths — without parallel stacks or scope from the later backlog.

**Architecture:** Keep one material factory (`createGemMaterial`) and replace its glass `MeshPhysicalMaterial` body with a jewelry gem path (`onBeforeCompile` + facet normals + quality uniforms). Slim the viewer chrome by splitting `StudioSidebar.tsx` into SRP panels under `src/features/viewer/ui/`. Surface Share/Embed/360 and AI Visuals from Export without rewriting embed/batch/AI backends. Each phase has a hard exit gate; do not start the next phase until the gate passes.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Three.js / R3F, Zustand, Vitest, existing FastAPI AI routes (`AI_BACKGROUND_MODE=stub` OK), Playwright golden harness.

**Spec:** [`docs/superpowers/specs/2026-07-10-competitive-upgrade-design.md`](../specs/2026-07-10-competitive-upgrade-design.md)  
**Backlog (do not pull in):** [`docs/superpowers/backlogs/2026-07-10-competitive-upgrade-later.md`](../backlogs/2026-07-10-competitive-upgrade-later.md)

## Global constraints

- TypeScript strict; zero `any`; no `@ts-ignore` (`docs/CODE-STANDARDS.md`).
- Feature layout (`docs/ARCHITECTURE.md`): pure logic in `src/lib`, UI in `src/features/*/ui`.
- Import via `@/` alias; run `npm run check:boundaries` after UI moves.
- **Hard phase order:** Phase 1 → 2 → 3 → 4 → 5. Exit gate must pass before the next phase’s first task.
- **Out of scope:** backlog A1–A2, B1–B9, C1–C4 (param-only glass forever, AI replacing realtime gems, marketing redesign, embed rewrite, 10k batch farm, new billing, custom model training, try-on physics, etc.).
- Do not commit secrets; AI keys stay in env examples only.

## Quality gates (map every phase)

| Gate | Command | When |
|------|---------|------|
| Unit tests | `npm test` | After every task that adds/changes `src/lib/**` or `__tests__` |
| Types | `npx tsc --noEmit` | End of each phase (and after large UI splits) |
| Lint | `npm run lint` | End of each phase; fix **errors** before merge |
| Import boundaries | `npm run check:boundaries` | After moving viewer UI modules |
| Goldens | `npm run test:golden` (dev server + SwiftShader) | After intentional gem look change (Phase 1); regenerate only with visual review |
| Backend | `cd backend && .venv/bin/python -m pytest` | Phase 5 if AI router/service touched |
| Smoke | upload → viewer → still (`docs/QUALITY-GATES.md`) | End of Phases 1–3 at minimum |

## File structure (create / modify)

### Phase 1 — Gem shader

| File | Responsibility |
|------|----------------|
| `src/lib/gem-gpu/ensure-faceted-gem-normals.ts` | **Create.** Shared CAD gem mesh prep (de-index + per-face normals); idempotent via `userData` flag |
| `src/lib/gem-gpu/jewelry-gem-shader.ts` | **Create.** GLSL chunk strings + `applyJewelryGemShader(material, opts)` via `onBeforeCompile` |
| `src/lib/gem-gpu/gem-physical-material.ts` | **Modify.** `createGemMaterial` builds physical base then applies jewelry shader; keep public API |
| `src/lib/gem-gpu/gem-configs.ts` | **Modify.** Optional `sparkleStrength?: number` on `GemConfig` with defaults (IDs unchanged) |
| `src/lib/library/create-material-from-params.ts` | **Modify.** `createGemMaterialFromParams` uses same jewelry path |
| `src/lib/apply-material-preset.ts` | **Modify.** Call `ensureFacetedGemNormals` when assigning gem materials |
| `src/lib/gem-gpu/apply-split-diamond.ts` | **Modify.** Facet normals on gem slot meshes after assign |
| `src/lib/viewer-quality.ts` | **Modify.** Export helper `gemShaderQualityReduce(tier)` for Performance path |
| `src/lib/__tests__/gem-physical-material.test.ts` | **Create.** Tag/preset/factory tests |
| `src/lib/__tests__/ensure-faceted-gem-normals.test.ts` | **Create.** Geometry fixture tests |
| `src/lib/__tests__/jewelry-gem-shader.test.ts` | **Create.** Uniform/defines wiring tests |
| `tests/goldens/*` | **Regenerate** after approved look change |

### Phase 2 — Slim UI

| File | Responsibility |
|------|----------------|
| `src/features/viewer/ui/studio-material-groups.ts` | **Create.** `MATERIAL_GROUPS`, lighting/finish lists extracted from sidebar |
| `src/features/viewer/ui/StudioPrimaryBar.tsx` | **Create.** Metal · Gem · Light · Export · More triggers only |
| `src/features/viewer/ui/MetalPickerPanel.tsx` | **Create.** Metal swatches + slot targeting |
| `src/features/viewer/ui/GemPickerPanel.tsx` | **Create.** Gem swatches + slot targeting |
| `src/features/viewer/ui/LightPickerPanel.tsx` | **Create.** Lighting presets only |
| `src/features/viewer/ui/ExportSharePanel.tsx` | **Create.** Capture, hi-res, share/embed entry, 360 entry, AI Visuals entry |
| `src/features/viewer/ui/StudioMoreDrawer.tsx` | **Create.** Scene buckets, quality mode, finishes, dense grids |
| `src/features/viewer/ui/StudioSidebar.tsx` | **Modify → thin orchestrator** composing the above (keep export name for `ViewerShell`) |
| `src/features/viewer/index.ts` | Keep exporting `StudioSidebar` only (orchestrator); do not barrel-export every panel |
| `src/lib/__tests__/export-parity.test.ts` | **Modify.** Point `downloadPng` invariant at `ExportSharePanel.tsx` |
| `src/lib/__tests__/studio-primary-ia.test.ts` | **Create.** Primary labels / More gating (string/source invariant) |

### Phase 3 — Embed / 360

| File | Responsibility |
|------|----------------|
| `src/lib/embed-settings.ts` | Unchanged contract; add tests only |
| `src/lib/__tests__/embed-settings.test.ts` | **Create.** URL/snippet/round-trip |
| `src/features/viewer/ui/ExportSharePanel.tsx` | First-class Share/Embed + 360 copy/progress |
| `src/features/editor/ui/EditorEmbedTab.tsx` | Polish unpublished/missing-SKU messaging (reuse helpers) |
| `src/stores/video-capture-store.ts` + capture UI | Clear busy/error on failure (no silent hang) |

### Phase 4 — Batch / variants

| File | Responsibility |
|------|----------------|
| `src/lib/variants/batch-export.ts` | Preserve restore; harden per-job error continuation if missing |
| `src/lib/__tests__/batch-export.test.ts` | **Create.** Cartesian size + restore invariant |
| `src/features/editor/ui/EditorImageTab.tsx` / `EditorVideoTab.tsx` | Progress, per-job failure, plan limits visible |
| Secondary entry | From More / Export secondary sheet — not a new primary-bar tab |

### Phase 5 — AI Visuals

| File | Responsibility |
|------|----------------|
| `src/features/editor/ui/EditorAiImageTab.tsx` | Background primary; Model secondary; stub label from `mode` |
| `src/components/modals/AiBgModal.tsx` | Align copy with “AI Visuals”; surface stub status |
| `src/lib/ai-image-api.ts` | Unchanged contract unless stub labeling needs a typed field |
| Backend AI routes | Touch only if stub labeling is missing; no new billing |

---

# Phase 1 — Diamond / gem realism (P0)

**Exit gate:** Success criterion 1 (live gems beat Gemora on fire/facet/sparkle) + unit tests green + goldens regenerated deliberately + `npx tsc --noEmit` clean. Metals still `MeshPhysicalMaterial` via `createPresetMaterial`.

---

### Task 1: Faceted gem normals helper

**Files:**
- Create: `src/lib/gem-gpu/ensure-faceted-gem-normals.ts`
- Test: `src/lib/__tests__/ensure-faceted-gem-normals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/ensure-faceted-gem-normals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ensureFacetedGemNormals } from "@/lib/gem-gpu/ensure-faceted-gem-normals";

describe("ensureFacetedGemNormals", () => {
  it("converts a smoothed indexed sphere into non-indexed faceted normals", () => {
    const geom = new THREE.SphereGeometry(1, 8, 6);
    expect(geom.index).not.toBeNull();

    const out = ensureFacetedGemNormals(geom);
    expect(out.index).toBeNull();
    const normals = out.getAttribute("normal");
    expect(normals).toBeTruthy();
    expect(normals.count).toBe(out.getAttribute("position").count);
  });

  it("is idempotent via userData flag (second call returns same geometry)", () => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const first = ensureFacetedGemNormals(geom);
    const second = ensureFacetedGemNormals(first);
    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/ensure-faceted-gem-normals.test.ts`  
Expected: FAIL — module `@/lib/gem-gpu/ensure-faceted-gem-normals` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/gem-gpu/ensure-faceted-gem-normals.ts`:

```ts
import * as THREE from "three";

export const FACETED_GEM_NORMALS_KEY = "gemFacetedNormals" as const;

/**
 * CAD gem meshes often arrive with smoothed vertex normals. Jewelry fire needs
 * per-face normals. Procedural cuts in cut-geometries.ts already flat-shade —
 * skip those via the userData flag after first prep.
 */
export function ensureFacetedGemNormals(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  if (geometry.userData[FACETED_GEM_NORMALS_KEY] === true) {
    return geometry;
  }

  const source = geometry.index ? geometry : geometry;
  const faceted = source.index ? source.toNonIndexed() : source.clone();
  faceted.computeVertexNormals();
  faceted.computeBoundingSphere();
  faceted.userData[FACETED_GEM_NORMALS_KEY] = true;

  if (faceted !== geometry) {
    // Caller owns disposal of the previous geometry when replacing on a mesh.
  }
  return faceted;
}

export function ensureFacetedGemNormalsOnMesh(mesh: THREE.Mesh): void {
  const next = ensureFacetedGemNormals(mesh.geometry);
  if (next !== mesh.geometry) {
    mesh.geometry.dispose();
    mesh.geometry = next;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/ensure-faceted-gem-normals.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/gem-gpu/ensure-faceted-gem-normals.ts src/lib/__tests__/ensure-faceted-gem-normals.test.ts
git commit -m "$(cat <<'EOF'
feat(gem-gpu): add ensureFacetedGemNormals for CAD gem meshes

EOF
)"
```

---

### Task 2: Jewelry gem shader module (uniforms + onBeforeCompile)

**Files:**
- Create: `src/lib/gem-gpu/jewelry-gem-shader.ts`
- Test: `src/lib/__tests__/jewelry-gem-shader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/jewelry-gem-shader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyJewelryGemShader,
  JEWELRY_GEM_SHADER_KEY,
  type JewelryGemShaderOpts,
} from "@/lib/gem-gpu/jewelry-gem-shader";

describe("applyJewelryGemShader", () => {
  it("tags material userData and installs onBeforeCompile", () => {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1 });
    const opts: JewelryGemShaderOpts = {
      sparkleStrength: 1,
      fireStrength: 1,
      qualityReduce: false,
      dispersionAmplitude: 0.035,
    };
    applyJewelryGemShader(m, opts);
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(typeof m.onBeforeCompile).toBe("function");
    expect(m.customProgramCacheKey).toBeTypeOf("function");
  });

  it("sets qualityReduce uniform path without removing jewelry tag", () => {
    const m = new THREE.MeshPhysicalMaterial();
    applyJewelryGemShader(m, {
      sparkleStrength: 0.8,
      fireStrength: 1,
      qualityReduce: true,
      dispersionAmplitude: 0.02,
    });
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(m.userData.jewelryGemQualityReduce).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/jewelry-gem-shader.test.ts`  
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/gem-gpu/jewelry-gem-shader.ts`:

```ts
import * as THREE from "three";

export const JEWELRY_GEM_SHADER_KEY = "jewelryGemShader" as const;

export type JewelryGemShaderOpts = {
  sparkleStrength: number;
  fireStrength: number;
  qualityReduce: boolean;
  dispersionAmplitude: number;
};

type JewelryUniforms = {
  uSparkleStrength: { value: number };
  uFireStrength: { value: number };
  uDispersionAmp: { value: number };
  uQualityReduce: { value: number };
  uTime: { value: number };
};

/**
 * Inject facet-aware sparkle + chromatic fire into MeshPhysicalMaterial.
 * Cap: env sparkle + fire lobes + one internal Fresnel boost — no path tracer.
 */
export function applyJewelryGemShader(
  material: THREE.MeshPhysicalMaterial,
  opts: JewelryGemShaderOpts,
): void {
  const uniforms: JewelryUniforms = {
    uSparkleStrength: { value: opts.sparkleStrength },
    uFireStrength: { value: opts.fireStrength },
    uDispersionAmp: { value: opts.dispersionAmplitude },
    uQualityReduce: { value: opts.qualityReduce ? 1 : 0 },
    uTime: { value: 0 },
  };

  material.userData[JEWELRY_GEM_SHADER_KEY] = true;
  material.userData.jewelryGemQualityReduce = opts.qualityReduce;
  material.userData.jewelryGemUniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uSparkleStrength;
uniform float uFireStrength;
uniform float uDispersionAmp;
uniform float uQualityReduce;
uniform float uTime;`,
      )
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
{
  // Facet flash: sharpen specular when normal is discontinuous vs view
  vec3 n = normalize(geometryNormal);
  vec3 v = normalize(geometryViewDir);
  float ndv = max(dot(n, v), 0.0);
  float facet = pow(1.0 - ndv, 2.0);

  float sparkleTaps = mix(4.0, 1.0, uQualityReduce);
  float sparkle = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= sparkleTaps) break;
    float ang = float(i) * 1.5707963 + uTime * 0.15;
    vec3 jitterN = normalize(n + 0.04 * vec3(cos(ang), sin(ang * 1.3), cos(ang * 0.7)));
    sparkle += pow(max(dot(jitterN, v), 0.0), 64.0);
  }
  sparkle = (sparkle / max(sparkleTaps, 1.0)) * uSparkleStrength;

  // Fire: cheap RGB-split specular lobe (not full spectral path)
  float fire = facet * uFireStrength;
  vec3 fireRgb = vec3(
    fire * (1.0 + uDispersionAmp * 2.0),
    fire,
    fire * (1.0 - uDispersionAmp)
  );

  // Internal lobe: Fresnel-ish boost into outgoing light
  float internalLobe = mix(0.35, 0.12, uQualityReduce) * pow(1.0 - ndv, 3.0);

  totalEmissiveRadiance += fireRgb * 0.25 + vec3(sparkle) * 0.4;
  material.specularIntensity += internalLobe;
}`,
      );
  };

  material.customProgramCacheKey = () =>
    `jewelry-gem-${opts.qualityReduce ? "perf" : "full"}-${opts.sparkleStrength.toFixed(2)}`;

  material.needsUpdate = true;
}

export function setJewelryGemTime(material: THREE.Material, timeSec: number): void {
  const uniforms = material.userData.jewelryGemUniforms as JewelryUniforms | undefined;
  if (uniforms) uniforms.uTime.value = timeSec;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/jewelry-gem-shader.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/gem-gpu/jewelry-gem-shader.ts src/lib/__tests__/jewelry-gem-shader.test.ts
git commit -m "$(cat <<'EOF'
feat(gem-gpu): add jewelry gem onBeforeCompile shader path

EOF
)"
```

---

### Task 3: Wire `createGemMaterial` + quality reduce helper

**Files:**
- Modify: `src/lib/gem-gpu/gem-physical-material.ts`
- Modify: `src/lib/gem-gpu/gem-configs.ts` (`GemConfig` optional `sparkleStrength`)
- Modify: `src/lib/viewer-quality.ts`
- Test: `src/lib/__tests__/gem-physical-material.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/gem-physical-material.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createGemMaterial,
  GEM_GPU_USER_KEY,
  gemPresetIdFromMaterial,
  isGemGpuMaterial,
} from "@/lib/gem-gpu/gem-physical-material";
import { JEWELRY_GEM_SHADER_KEY } from "@/lib/gem-gpu/jewelry-gem-shader";
import { GEM_PRESET_IDS } from "@/lib/gem-gpu/gem-configs";

const SAMPLE_IDS = [
  "diamond",
  "moissanite",
  "ruby",
  "sapphire",
  "emerald",
  "pearl",
] as const;

describe("createGemMaterial", () => {
  it("tags GEM_GPU_USER_KEY and jewelry shader for sample presets", () => {
    for (const id of SAMPLE_IDS) {
      expect(GEM_PRESET_IDS.includes(id)).toBe(true);
      const m = createGemMaterial(id);
      expect(isGemGpuMaterial(m)).toBe(true);
      expect(m.userData[GEM_GPU_USER_KEY]).toBe(id);
      expect(gemPresetIdFromMaterial(m)).toBe(id);
      expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
      m.dispose();
    }
  });

  it("accepts qualityReduce option without dropping tags", () => {
    const m = createGemMaterial("diamond", { qualityReduce: true });
    expect(isGemGpuMaterial(m)).toBe(true);
    expect(m.userData.jewelryGemQualityReduce).toBe(true);
    m.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/gem-physical-material.test.ts`  
Expected: FAIL — `createGemMaterial` arity / missing `JEWELRY_GEM_SHADER_KEY` on material.

- [ ] **Step 3: Extend GemConfig + viewer-quality helper**

In `src/lib/gem-gpu/gem-configs.ts`, add to `GemConfig`:

```ts
  /** 0..1 — env micro-glint strength. Default 1 when omitted. */
  sparkleStrength?: number;
```

Do **not** rename or remove any existing `GEM_CONFIGS` keys.

In `src/lib/viewer-quality.ts`, add:

```ts
/** Jewelry gem shader: Performance tier reduces sparkle taps / internal lobe. */
export function gemShaderQualityReduce(tier: QualityTier): boolean {
  return tier === "performance";
}
```

- [ ] **Step 4: Rewrite `createGemMaterial`**

Replace body of `src/lib/gem-gpu/gem-physical-material.ts` with:

```ts
import * as THREE from "three";
import { GEM_CONFIGS, type GemPresetId } from "@/lib/gem-gpu/gem-configs";
import { applyJewelryGemShader } from "@/lib/gem-gpu/jewelry-gem-shader";

export const GEM_GPU_USER_KEY = "gemGpuDiamond" as const;

export type CreateGemMaterialOptions = {
  qualityReduce?: boolean;
};

export function createGemMaterial(
  presetId: GemPresetId,
  options: CreateGemMaterialOptions = {},
): THREE.MeshPhysicalMaterial {
  const cfg = GEM_CONFIGS[presetId];
  const transmission = cfg.transmission ?? 1;
  const m = new THREE.MeshPhysicalMaterial({
    name: `GemGPU-${presetId}`,
    color: new THREE.Color(cfg.baseColor),
    metalness: 0,
    roughness: cfg.roughness,
    transmission,
    thickness: cfg.thickness,
    ior: cfg.ior,
    dispersion: cfg.dispersionBase,
    transparent: transmission > 0,
    envMapIntensity: cfg.envMapIntensity * 1.25,
    attenuationColor: new THREE.Color(cfg.attenuationColor),
    attenuationDistance: cfg.attenuationDistance,
    specularIntensity: 1.0,
    specularColor: new THREE.Color(0xffffff),
    reflectivity: 0.6,
    clearcoat: cfg.clearcoat ?? 0,
    clearcoatRoughness: cfg.clearcoat ? 0.02 : 0,
    iridescence: cfg.iridescence ?? 0,
    iridescenceIOR: cfg.iridescence ? 1.3 : 1,
    flatShading: false,
  });
  m.userData[GEM_GPU_USER_KEY] = presetId;

  applyJewelryGemShader(m, {
    sparkleStrength: cfg.sparkleStrength ?? 1,
    fireStrength: 1,
    qualityReduce: options.qualityReduce ?? false,
    dispersionAmplitude: cfg.dispersionAmplitude,
  });

  return m;
}

export function createGemGpuDiamondMaterial(): THREE.MeshPhysicalMaterial {
  return createGemMaterial("diamond");
}

export function isGemGpuMaterial(
  m: THREE.Material,
): m is THREE.MeshPhysicalMaterial {
  if (!(m instanceof THREE.MeshPhysicalMaterial)) return false;
  const tag = m.userData[GEM_GPU_USER_KEY];
  return typeof tag === "string" || tag === true;
}

export const isGemGpuDiamondMaterial = isGemGpuMaterial;

export function gemPresetIdFromMaterial(
  m: THREE.MeshPhysicalMaterial,
): GemPresetId | null {
  const tag = m.userData[GEM_GPU_USER_KEY];
  if (typeof tag === "string") return tag as GemPresetId;
  if (tag === true) return "diamond";
  return null;
}
```

Keep `src/lib/gem-gpu/diamond-physical-material.ts` as re-exports only (no change required if exports stay compatible).

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run src/lib/__tests__/gem-physical-material.test.ts src/lib/__tests__/jewelry-gem-shader.test.ts src/lib/__tests__/viewer-quality.test.ts
npx tsc --noEmit
```

Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gem-gpu/gem-physical-material.ts src/lib/gem-gpu/gem-configs.ts src/lib/viewer-quality.ts src/lib/__tests__/gem-physical-material.test.ts
git commit -m "$(cat <<'EOF'
feat(gem-gpu): wire createGemMaterial through jewelry shader

EOF
)"
```

---

### Task 4: Library params + apply-preset facet wiring + quality at call sites

**Files:**
- Modify: `src/lib/library/create-material-from-params.ts`
- Modify: `src/lib/apply-material-preset.ts`
- Modify: `src/lib/gem-gpu/apply-split-diamond.ts`
- Modify: call sites that should honor Performance tier (viewer apply path only — **not** export/render feature)

- [ ] **Step 1: Write failing test for params path**

Add to `src/lib/__tests__/gem-physical-material.test.ts`:

```ts
import { createGemMaterialFromParams } from "@/lib/library/create-material-from-params";

describe("createGemMaterialFromParams", () => {
  it("produces a jewelry-tagged gem material from ad-hoc params", () => {
    const m = createGemMaterialFromParams({
      baseColor: "#ffffff",
      ior: 2.417,
      dispersionBase: 0.08,
      roughness: 0.02,
      thickness: 0.55,
      envMapIntensity: 1.6,
      attenuationColor: "#ffffff",
      attenuationDistance: 0.4,
    });
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    m.dispose();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/lib/__tests__/gem-physical-material.test.ts`  
Expected: FAIL — params path still plain physical without jewelry tag.

- [ ] **Step 3: Update `createGemMaterialFromParams`**

In `src/lib/library/create-material-from-params.ts`, after building the `MeshPhysicalMaterial`, always jewelry-tag custom gems:

```ts
import { applyJewelryGemShader } from "@/lib/gem-gpu/jewelry-gem-shader";
import { GEM_GPU_USER_KEY } from "@/lib/gem-gpu/gem-physical-material";

// after constructing `m`:
m.userData[GEM_GPU_USER_KEY] = true;
applyJewelryGemShader(m, {
  sparkleStrength: typeof params.sparkleStrength === "number" ? params.sparkleStrength : 1,
  fireStrength: 1,
  qualityReduce: false,
  dispersionAmplitude:
    typeof params.dispersionAmplitude === "number" ? params.dispersionAmplitude : 0.035,
});
return m;
```

- [ ] **Step 4: Facet normals on gem assign**

In `src/lib/apply-material-preset.ts`, update `assignMaterial`:

```ts
import { isGemGpuMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { ensureFacetedGemNormalsOnMesh } from "@/lib/gem-gpu/ensure-faceted-gem-normals";

function assignMaterial(mesh: THREE.Mesh, template: THREE.Material): void {
  if (Array.isArray(mesh.material)) {
    const len = mesh.material.length;
    mesh.material.forEach((m) => m.dispose());
    mesh.material = Array.from({ length: len }, () => template.clone());
  } else {
    mesh.material.dispose();
    mesh.material = template.clone();
  }
  if (isGemGpuMaterial(template)) {
    ensureFacetedGemNormalsOnMesh(mesh);
  }
}
```

In `src/lib/gem-gpu/apply-split-diamond.ts`, after assigning materials, for each mesh whose material name was `Carbon` (gem slot), call `ensureFacetedGemNormalsOnMesh(obj)`.

- [ ] **Step 5: Thread `qualityReduce` through apply + JewelryModel**

Extend signatures in `src/lib/apply-material-preset.ts`:

```ts
export function applyMaterialPreset(
  root: THREE.Object3D,
  preset: MaterialPresetId,
  finish: FinishId = "polished",
  qualityReduce = false,
): void
```

Wherever `createGemMaterial(...)` is called inside this file, pass `{ qualityReduce }`.

Same optional last arg on `applyMaterialPresetBySlot` and `buildTemplate` gem branches.

In `src/features/viewer/ui/JewelryModel.tsx`, at the existing apply `useEffect`:

```ts
import {
  gemShaderQualityReduce,
  readDeviceCaps,
  resolveEffectiveQuality,
} from "@/lib/viewer-quality";
import { useViewerQualityStore } from "@/stores/viewer-quality-store";

const qualityLevel = useViewerQualityStore((s) => s.level);
const qualityReduce = gemShaderQualityReduce(
  resolveEffectiveQuality(qualityLevel, readDeviceCaps()).tier,
);
// pass qualityReduce into applyMaterialPreset / applyMaterialPresetBySlot
```

**Do not** import `viewer-quality` from `src/features/render/**`.

- [ ] **Step 6: Run verification**

```bash
npm test
npx tsc --noEmit
npm run check:boundaries
```

Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/library/create-material-from-params.ts src/lib/apply-material-preset.ts src/lib/gem-gpu/apply-split-diamond.ts src/features/viewer/ui/JewelryModel.tsx src/lib/__tests__/gem-physical-material.test.ts
git commit -m "$(cat <<'EOF'
feat(gem-gpu): facet CAD gems and jewelry-tag library params

EOF
)"
```

---

### Task 5: Shader compile fallback + subtle time uniform (viewer)

**Files:**
- Create: `src/lib/gem-gpu/jewelry-gem-safe-mode.ts` (or fold into `jewelry-gem-shader.ts`)
- Modify: viewer canvas / a small R3F bridge that advances `uTime` for gem materials
- Manual checklist (no automated Gemora compare)

- [ ] **Step 1: Document compile-fail behavior in code**

In `jewelry-gem-shader.ts` (or new helper), export:

```ts
export function enableJewelryGemSafeMode(material: THREE.MeshPhysicalMaterial): void {
  // Keep jewelry path: reduce sparkle/fire only — never silent stock glass.
  applyJewelryGemShader(material, {
    sparkleStrength: 0.35,
    fireStrength: 0.5,
    qualityReduce: true,
    dispersionAmplitude: 0.02,
  });
}
```

On WebGL program error (listen once via `renderer.debug` / `material.onBeforeCompile` try path if you add a wrapper), show toast: `Gem preview unavailable — retrying safe mode`, then call `enableJewelryGemSafeMode`. Log the compile error to console.

- [ ] **Step 2: Time uniform bridge**

Create `src/features/viewer/ui/JewelryGemTimeBridge.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { setJewelryGemTime } from "@/lib/gem-gpu/jewelry-gem-shader";
import { JEWELRY_GEM_SHADER_KEY } from "@/lib/gem-gpu/jewelry-gem-shader";

export function JewelryGemTimeBridge() {
  useFrame((state) => {
    state.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m?.userData?.[JEWELRY_GEM_SHADER_KEY]) {
          setJewelryGemTime(m, state.clock.elapsedTime);
        }
      }
    });
  });
  return null;
}
```

Mount next to `VideoCaptureBridge` in `src/features/viewer/ui/ViewerCanvas.tsx`.

- [ ] **Step 3: Manual Gemora checklist (exit gate evidence)**

On a round brilliant + metal band, orbit and confirm:

1. Facet flash on tilt (not milky glass ball)
2. Visible fire / chromatic sparkle
3. Metals unchanged
4. Performance quality still looks like a gem (less sparkle, not glass fallback)

- [ ] **Step 4: Goldens**

With intentional look change approved:

```bash
# terminal A
npm run dev
# terminal B — SwiftShader harness only
npm run golden:capture
# eyeball tests/goldens/*.png
npm run test:golden
```

Commit regenerated goldens with the gem change (never weaken SSIM threshold).

- [ ] **Step 5: Phase 1 gate verification**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run check:boundaries
```

- [ ] **Step 6: Commit**

```bash
git add src/features/viewer/ui/JewelryGemTimeBridge.tsx src/features/viewer/ui/ViewerCanvas.tsx src/lib/gem-gpu/jewelry-gem-shader.ts tests/goldens
git commit -m "$(cat <<'EOF'
feat(viewer): gem time bridge, safe mode, refresh goldens for jewelry look

EOF
)"
```

**Phase 1 exit:** Stop. Do not start Phase 2 until criterion 1 is signed off.

---

# Phase 2 — Minimal Gemora-like UI

**Exit gate:** Success criterion 2 — primary IA is Metal · Gem · Light · Export (+ More); 30-second metal/gem/light/export path without opening More; `export-parity` still green; boundaries clean.

---

### Task 6: Extract material group data

**Files:**
- Create: `src/features/viewer/ui/studio-material-groups.ts`
- Modify: `src/features/viewer/ui/StudioSidebar.tsx` (import from new module)

- [ ] **Step 1: Move constants without behavior change**

Cut `MATERIAL_GROUPS`, `LIGHTING`, `FINISHES`, `SCENE_BUCKET_ORDER`, and pure helpers (`prettyName`, `groupOf`, `slotKind`, …) that have no React hooks into `studio-material-groups.ts`. Re-export types used by panels.

- [ ] **Step 2: Verify no visual/IA change yet**

```bash
npx tsc --noEmit
npm test
```

Expected: PASS (including `export-parity` still finding `downloadPng` in `StudioSidebar.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/features/viewer/ui/studio-material-groups.ts src/features/viewer/ui/StudioSidebar.tsx
git commit -m "$(cat <<'EOF'
refactor(viewer): extract studio material group constants

EOF
)"
```

---

### Task 7: Primary bar + picker panels (SRP split)

**Files:**
- Create: `StudioPrimaryBar.tsx`, `MetalPickerPanel.tsx`, `GemPickerPanel.tsx`, `LightPickerPanel.tsx`, `ExportSharePanel.tsx`, `StudioMoreDrawer.tsx`
- Modify: `StudioSidebar.tsx` → orchestrator
- Test: `src/lib/__tests__/studio-primary-ia.test.ts`
- Modify: `src/lib/__tests__/export-parity.test.ts`

- [ ] **Step 1: Write IA invariant test (fail until labels exist)**

Create `src/lib/__tests__/studio-primary-ia.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("studio primary IA", () => {
  it("primary bar exposes Metal, Gem, Light, Export, and More", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/features/viewer/ui/StudioPrimaryBar.tsx"),
      "utf8",
    );
    for (const label of ["Metal", "Gem", "Light", "Export", "More"]) {
      expect(src.includes(label), `missing ${label}`).toBe(true);
    }
  });

  it("scene buckets live in More, not primary bar", () => {
    const primary = readFileSync(
      path.join(process.cwd(), "src/features/viewer/ui/StudioPrimaryBar.tsx"),
      "utf8",
    );
    const more = readFileSync(
      path.join(process.cwd(), "src/features/viewer/ui/StudioMoreDrawer.tsx"),
      "utf8",
    );
    expect(primary.includes("ENVIRONMENT-METAL")).toBe(false);
    expect(more.includes("ENVIRONMENT-METAL") || more.includes("Scene buckets")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/lib/__tests__/studio-primary-ia.test.ts`  
Expected: FAIL — files missing.

- [ ] **Step 3: Implement panels**

`StudioPrimaryBar` — five controls only; controlled `activePanel: "metal" | "gem" | "light" | "export" | "more" | null`.

`MetalPickerPanel` / `GemPickerPanel` — reuse swatch UI from current Materials tab; filter groups by metal vs gem via `isGemPresetId`.

`LightPickerPanel` — only `LIGHTING` presets.

`ExportSharePanel` — move `downloadPng`, hi-res, 360, AI, embed open handlers from current Export tab (keep `renderAtResolution` path).

`StudioMoreDrawer` — scene buckets, photometric/standard quality, finishes, catalog search grids that are not primary.

`StudioSidebar` becomes:

```tsx
export function StudioSidebar(props: StudioSidebarProps) {
  const [panel, setPanel] = useState<"metal" | "gem" | "light" | "export" | "more" | null>("metal");
  return (
    <div className={cn("flex h-full flex-col", props.className)}>
      <StudioPrimaryBar active={panel} onChange={setPanel} />
      {panel === "metal" && <MetalPickerPanel ... />}
      {panel === "gem" && <GemPickerPanel ... />}
      {panel === "light" && <LightPickerPanel ... />}
      {panel === "export" && (
        <ExportSharePanel
          onOpenAi={props.onOpenAi}
          onOpenExport={props.onOpenExport}
          onOpenHiResExport={props.onOpenHiResExport}
          onOpenVideo360={props.onOpenVideo360}
        />
      )}
      {panel === "more" && <StudioMoreDrawer ... />}
    </div>
  );
}
```

Preserve existing store wiring (`useMaterialPresetStore`, slot selections). Do not delete features — only relocate under More.

- [ ] **Step 4: Update export-parity test**

Change `export-parity.test.ts` to read `ExportSharePanel.tsx` instead of `StudioSidebar.tsx` for `downloadPng` / `renderAtResolution` invariants.

- [ ] **Step 5: Run verification**

```bash
npx vitest run src/lib/__tests__/studio-primary-ia.test.ts src/lib/__tests__/export-parity.test.ts
npx tsc --noEmit
npm run check:boundaries
npm run lint
```

- [ ] **Step 6: Manual 30-second path**

Cold open studio with a model: change metal → gem → light → export still, without opening More.

- [ ] **Step 7: Commit**

```bash
git add src/features/viewer/ui src/lib/__tests__/studio-primary-ia.test.ts src/lib/__tests__/export-parity.test.ts
git commit -m "$(cat <<'EOF'
feat(viewer): slim primary IA to Metal Gem Light Export More

EOF
)"
```

**Phase 2 exit:** Stop until criterion 2 passes.

---

# Phase 3 — Embed / share + 360

**Exit gate:** Success criterion 3 — share link, embed snippet, or 360 from Export in under one minute; clear errors; no dead iframe URLs when unpublished/missing key.

---

### Task 8: Embed settings unit tests (contract lock)

**Files:**
- Test: `src/lib/__tests__/embed-settings.test.ts`
- Modify: none unless a bug is found (then fix root cause in `embed-settings.ts`)

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildEmbedIframeSnippet,
  buildEmbedUrl,
  embedSettingsToQuery,
  parseEmbedUrlParams,
  resolveEmbedKey,
  resolveEmbedSettings,
} from "@/lib/embed-settings";

describe("embed-settings", () => {
  it("builds URL with query overrides", () => {
    const url = buildEmbedUrl("https://studio.example", "SKU-1", {
      autoRotate: false,
      showChrome: false,
    });
    expect(url).toContain("/embed/SKU-1");
    expect(url).toContain("autorotate=0");
    expect(url).toContain("chrome=0");
  });

  it("round-trips settings through query params", () => {
    const settings = resolveEmbedSettings({ showTitle: false, brandingText: "Acme" });
    const qs = embedSettingsToQuery(settings);
    const params = Object.fromEntries(new URLSearchParams(qs.replace(/^\?/, "")));
    const parsed = parseEmbedUrlParams(params);
    expect(resolveEmbedSettings(null, parsed).showTitle).toBe(false);
    expect(resolveEmbedSettings(null, parsed).brandingText).toBe("Acme");
  });

  it("iframe snippet includes src and dimensions", () => {
    const snippet = buildEmbedIframeSnippet("https://studio.example/embed/x", {
      width: 640,
      height: 480,
      title: "Ring",
    });
    expect(snippet).toContain('src="https://studio.example/embed/x"');
    expect(snippet).toContain('width="640"');
    expect(snippet).toContain('title="Ring"');
  });

  it("resolveEmbedKey prefers sku", () => {
    expect(resolveEmbedKey(" ABC ", "viewer-1")).toBe("ABC");
    expect(resolveEmbedKey(null, "viewer-1")).toBe("viewer-1");
  });
});
```

- [ ] **Step 2: Run**

`npx vitest run src/lib/__tests__/embed-settings.test.ts` — Expected: PASS (locks current contract).

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/embed-settings.test.ts
git commit -m "$(cat <<'EOF'
test(embed): lock embed URL and snippet contract

EOF
)"
```

---

### Task 9: First-class Share/Embed + 360 in ExportSharePanel

**Files:**
- Modify: `src/features/viewer/ui/ExportSharePanel.tsx`
- Modify: `src/features/editor/ui/EditorEmbedTab.tsx` (copy polish)
- Modify: `src/components/modals/Video360Modal.tsx` (progress/error copy only)

- [ ] **Step 1: Export panel UX**

In `ExportSharePanel`, order actions:

1. Capture still  
2. Hi-res PNG  
3. Share link / Embed snippet (opens existing `ExportModal` / embed flow — `onOpenExport`)  
4. 360° turntable (`onOpenVideo360`)  
5. AI Visuals (`onOpenAi`) — entry only; Phase 5 hardens labeling  

When embed key would be empty or model unpublished, show inline: “Publish or set a SKU before embedding” — do not copy a dead URL. Reuse `resolveEmbedKey` + existing publish state if available on props; otherwise keep opening `ExportModal` which already warns on missing SKU in `EditorEmbedTab`.

- [ ] **Step 2: 360 failure UX**

`Video360Modal` already has `busy` / `error` / `progress` state and clears on dialog close. Harden copy only:

1. If `getVideoCaptureRefs()` is null when Record is clicked, set error to `3D view not ready — wait for the model to load, then try again.` (same pattern as AI tab).
2. On catch, keep `setBusy(false)` in `finally` (verify it exists; add if missing).
3. Show a Retry button that clears `error` and re-invokes the record handler.
4. Status line must show `Recording… {progress}%` while busy so the path never looks hung.

- [ ] **Step 3: Manual gate**

From finished look → Export → copy embed → paste blank HTML → loads; or 360 completes/fails clearly — under one minute.

- [ ] **Step 4: Verify**

```bash
npm test
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/features/viewer/ui/ExportSharePanel.tsx src/features/editor/ui/EditorEmbedTab.tsx
git commit -m "$(cat <<'EOF'
feat(viewer): first-class share embed and 360 from Export

EOF
)"
```

**Phase 3 exit:** Stop until criterion 3 passes. Do **not** rebuild embed player (backlog B4).

---

# Phase 4 — Batch / variants polish

**Exit gate:** Success criterion 4 — combo → generate → review → export with visible progress, failures, plan limits; entry secondary (More / Export), not a permanent primary tab.

---

### Task 10: Batch export unit tests + per-job failure continuation

**Files:**
- Create: `src/lib/__tests__/batch-export.test.ts`
- Modify: `src/lib/variants/batch-export.ts` — add pure `estimateBatchJobCount`
- Modify: `src/features/editor/ui/EditorImageTab.tsx`
- Modify: `src/features/editor/ui/EditorVideoTab.tsx` (same progress/failure pattern)

- [ ] **Step 1: Write failing test for job count helper**

Add to `src/lib/variants/batch-export.ts`:

```ts
/**
 * UI estimate matching buildBatchExportJobs expansion:
 * - selectedVariantIds.length > 0 → that count; else variantsStateItemCount (0 means 1 live snapshot)
 * - scenes = 1 (current) + extraSelectedSceneCount
 */
export function estimateBatchJobCount(input: {
  selectedVariantCount: number;
  variantsStateItemCount: number;
  extraSelectedSceneCount: number;
}): number {
  const variantCount =
    input.selectedVariantCount > 0
      ? input.selectedVariantCount
      : Math.max(1, input.variantsStateItemCount);
  const scenes = 1 + Math.max(0, input.extraSelectedSceneCount);
  return scenes * variantCount;
}
```

Create `src/lib/__tests__/batch-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estimateBatchJobCount } from "@/lib/variants/batch-export";

describe("estimateBatchJobCount", () => {
  it("expands 2 variants × (current + 1 extra scene) to 4", () => {
    expect(
      estimateBatchJobCount({
        selectedVariantCount: 2,
        variantsStateItemCount: 5,
        extraSelectedSceneCount: 1,
      }),
    ).toBe(4);
  });

  it("uses one live job when no variants selected and state empty", () => {
    expect(
      estimateBatchJobCount({
        selectedVariantCount: 0,
        variantsStateItemCount: 0,
        extraSelectedSceneCount: 0,
      }),
    ).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement helper, re-run PASS**

Run: `npx vitest run src/lib/__tests__/batch-export.test.ts`

- [ ] **Step 3: Per-job failure continuation in EditorImageTab**

Do **not** change `runBatchExportJobs` to swallow errors (its `finally` already restores presets). Change the `renderOne` callback in `EditorImageTab.tsx`:

```ts
type BatchTileResult = { ok: true; label: string } | { ok: false; label: string; message: string };
const tileResults: BatchTileResult[] = [];
let completed = 0;

await runBatchExportJobs(jobs, batchContext, async (job) => {
  const label = batchFilenamePrefix(job);
  try {
    await renderCurrentView(`${label}-${IMAGE_RESOLUTIONS[resolution].label}`);
    tileResults.push({ ok: true, label });
  } catch (e) {
    tileResults.push({
      ok: false,
      label,
      message: e instanceof Error ? e.message : "Render failed",
    });
  } finally {
    completed += 1;
    setStatus(`Batch ${completed}/${jobs.length}`);
  }
  return tileResults[tileResults.length - 1]!;
});

const failed = tileResults.filter((t) => !t.ok);
setStatus(
  failed.length === 0
    ? `Downloaded ${tileResults.length} images`
    : `Finished ${tileResults.length} jobs — ${failed.length} failed`,
);
if (failed.length > 0) {
  setError(failed.map((f) => `${f.label}: ${f.message}`).join("; "));
}
```

Show `estimateBatchJobCount(...)` above the Export button when mode is `multiple`. If billing/plan blocks batch (`batch_export` flag or plan), show remaining limit message before starting (reuse existing billing client patterns already in the tab if present; otherwise FeatureGate on the multiple mode control).

Mirror the same `tileResults` / progress pattern in `EditorVideoTab.tsx` batch path.

Entry remains under editor Image/Video (and More) — **do not** add Batch to `StudioPrimaryBar`.

- [ ] **Step 4: Manual 2×2**

Metal×gem 2×2 → 4 jobs; force one failure (e.g. abort mid-run) → other jobs complete; summary lists failures.

- [ ] **Step 5: Verify + commit**

```bash
npm test
npx tsc --noEmit
git add src/lib/variants/batch-export.ts src/lib/__tests__/batch-export.test.ts src/features/editor/ui/EditorImageTab.tsx src/features/editor/ui/EditorVideoTab.tsx
git commit -m "$(cat <<'EOF'
feat(variants): batch progress failures and job count clarity

EOF
)"
```

**Phase 4 exit:** Stop until criterion 4 passes. No 10k farm (B5), no new billing (B6).

---

# Phase 5 — AI lifestyle / models

**Exit gate:** Success criterion 5 — one AI Visuals entry; Background primary; Model secondary; stub labeled; same live materials in transparent capture; credits only on success (existing refund path preserved).

---

### Task 11: AI Visuals entry + stub labeling

**Files:**
- Modify: `src/features/editor/ui/EditorAiImageTab.tsx`
- Modify: `src/components/modals/AiBgModal.tsx`
- Modify: `ExportSharePanel` label → “AI Visuals”
- Backend: only if `mode` already returned (`shoot:stub` / `model:stub`) is not shown — prefer frontend label from `data.mode`

- [ ] **Step 1: UI hierarchy**

In `EditorAiImageTab`, default `subMode` to `"shoot"`. Present sub-modes as:

1. Background (maps to existing `shoot` + `custom`)  
2. Model (`model`, gated by `ai_on_model` feature flag via `FeatureGate` if not already)

Keep using `captureTransparentPng` → `requestAiImage` (WYSIWYG with Phase 1 materials).

- [ ] **Step 2: Stub labeling**

When `lastMode` includes `stub`, set status to `Stub result (dev mode) — not production AI` instead of only `AI image ready`.

```ts
setStatus(
  (data.mode ?? "").includes("stub")
    ? "Stub result (dev mode) — not production AI"
    : "AI image ready",
);
```

Mirror the same in `AiBgModal` if it has its own generate path.

- [ ] **Step 3: Credits**

Do not change billing schema. Keep existing consume-on-start + refund-on-error in `EditorAiImageTab`. Manual check: stub success still consumes one credit only when backend returns 200 (current router consumes after success) — if frontend consumes before request, keep refund on catch (already present).

- [ ] **Step 4: Verification**

```bash
npm test
npx tsc --noEmit
npm run lint
# if backend touched:
cd backend && .venv/bin/python -m pytest
```

Manual: `AI_BACKGROUND_MODE=stub` → labeled stub; transparent capture shows diamond fire from Phase 1.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/ui/EditorAiImageTab.tsx src/components/modals/AiBgModal.tsx src/features/viewer/ui/ExportSharePanel.tsx
git commit -m "$(cat <<'EOF'
feat(ai): AI Visuals entry with stub labeling and model secondary

EOF
)"
```

**Phase 5 exit:** Full upgrade complete when criteria 1–5 all hold and cross-cutting gates are green.

---

## Cross-cutting final checklist

- [ ] `npm test`
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint` (errors fixed)
- [ ] `npm run check:boundaries`
- [ ] Smoke: upload → viewer → still (`docs/QUALITY-GATES.md`)
- [ ] No secrets in commits
- [ ] Backlog items still deferred (no param-only glass forever, no embed rewrite, no 10k farm, no new billing)

---

## Self-review (plan author)

### Spec coverage

| Spec requirement | Task(s) |
|------------------|---------|
| Jewelry gem material via factory | Tasks 2–3 |
| Faceted CAD normals | Tasks 1, 4 |
| Quality fallback (not glass) | Tasks 3–5 |
| `createGemMaterialFromParams` on new path | Task 4 |
| Metals unchanged | Task 3 (metals never call jewelry path) |
| Slim Metal/Gem/Light/Export/More | Tasks 6–7 |
| Share/embed/360 first-class | Tasks 8–9 |
| Batch progress/failures/limits | Task 10 |
| AI Visuals primary/secondary + stub | Task 11 |
| Preserve GEM IDs / embed helpers / flags | Tasks 3, 8; flags untouched |
| Goldens after look change | Task 5 |
| Ordered gates | Phase headers |

### Placeholder scan

No TBD/TODO/“implement later” / “similar to Task N” left unresolved. Shader GLSL is concrete; UI split names are concrete; commands map to `docs/QUALITY-GATES.md`.

### Type consistency

- `CreateGemMaterialOptions.qualityReduce` and `applyMaterialPreset(..., qualityReduce)` used in Tasks 3–4  
- `JEWELRY_GEM_SHADER_KEY` / `GEM_GPU_USER_KEY` consistent across tests  
- `ExportSharePanel` owns `downloadPng` after Task 7; `export-parity` updated accordingly  
- `gemShaderQualityReduce(tier)` uses existing `QualityTier` from `viewer-quality.ts`  
- `estimateBatchJobCount` is the only new batch helper name (Task 10)
