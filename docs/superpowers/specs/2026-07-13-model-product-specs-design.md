# Model Editor Product Specs — Design

**Date:** 2026-07-13  
**Status:** Approved — implementation in progress  
**Owner:** Smit Desai  
**Architecture rules:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/CODE-STANDARDS.md`](../../CODE-STANDARDS.md)

---

## 1. Overview

Add structured **jewelry product specifications** to the Model Editor (`/model/[id]`) via a new **Specs** tab in the editor rail. Specs capture what a piece *is* (line-sheet / PDP data), separate from what it *looks like* in 3D (Metal/Gem material tabs).

**Locked decisions (brainstorming)**

| Decision | Choice |
|----------|--------|
| Scope | Product specs / attributes — not catalog UX redesign |
| Attributes in v1 | Metal & purity, finish, stone specs, setting & design, sizing & dimensions |
| Out of scope v1 | Cert/commerce (GIA number, price, collection) |
| Placement | **New Specs tab** in editor rail (not Settings, not split across Metal/Gem) |
| Persistence | New `product_specs` JSON column on `scenes` |
| Save UX | Explicit **Update specs** button (matches Settings tab pattern) |

**Non-goals (v1)**

- Auto-sync specs to 3D materials on every catalog click (optional suggest helper only)
- Per-variant product specs (scene-level only; variants keep material snapshots)
- Public PDP / embed display of specs (editor capture only)
- New metals/gems in catalog
- Import/export of spec sheets (CSV, GIA XML)

---

## 2. Success criteria

1. **Discoverable** — Specs tab appears in editor rail with a clear icon and label; jewelers find product attributes without hunting in Settings or material tabs.
2. **Complete v1 fields** — All five attribute groups are editable and persist across reload.
3. **Independent of visuals** — Changing a spec does not change 3D materials; changing materials does not overwrite specs unless user clicks **Suggest from materials**.
4. **No regressions** — Existing scene patch, variants, auto-persist for materials/lighting, and Settings tab unchanged.
5. **Typed & validated** — Frontend and backend share a schema; invalid values rejected with field-level errors.

---

## 3. Data model

### 3.1 Storage

Add nullable JSON column to `scenes`:

```python
product_specs: Mapped[dict] = mapped_column(JSON, default=dict)
```

Alembic migration: `product_specs` JSON, default `{}`, backfill existing rows to `{}`.

Expose on `SceneListItem`, `SceneDetail`, and `ScenePatch` as `product_specs: dict[str, Any]`.

### 3.2 TypeScript shape

New file: `src/lib/product-specs/types.ts`

```typescript
export type FinishSpec =
  | "polished"
  | "brushed"
  | "satin"
  | "hammered"
  | "sandblasted";

export type SettingType =
  | "prong"
  | "bezel"
  | "pave"
  | "channel"
  | "tension"
  | "flush"
  | "other";

export type ShankProfile =
  | "flat"
  | "comfort-fit"
  | "knife-edge"
  | "rounded"
  | "other";

export type HeadStyle =
  | "solitaire"
  | "halo"
  | "three-stone"
  | "cluster"
  | "other";

export type StoneCut =
  | "round"
  | "oval"
  | "cushion"
  | "emerald"
  | "pear"
  | "marquise"
  | "princess"
  | "radiant"
  | "asscher"
  | "heart"
  | "other";

export type ClarityGrade =
  | "FL" | "IF" | "VVS1" | "VVS2" | "VS1" | "VS2" | "SI1" | "SI2" | "I1" | "I2" | "I3";

export type ColorGrade =
  | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M"
  | "fancy"; // free-text in fancy_color when selected

export type StoneSpec = {
  id: string;           // uuid for list keys
  gem_type: string;     // free text or catalog slug hint, e.g. "diamond"
  carat: number | null;
  clarity: ClarityGrade | "" | null;
  color: ColorGrade | "" | null;
  fancy_color: string;  // when color === "fancy"
  cut: StoneCut | "" | null;
  quantity: number;     // default 1
};

export type ProductSpecs = {
  // Metal & purity
  metal_type: string;       // e.g. "18K Yellow Gold", "Platinum 950"
  metal_purity: string;     // e.g. "75%", "950‰", "925"
  hallmark: string;

  // Finish
  finish: FinishSpec | "" | null;

  // Stones (aggregate + per-stone rows)
  stone_count: number | null;
  total_carat: number | null;
  stones: StoneSpec[];

  // Setting & design
  setting_type: SettingType | "" | null;
  setting_type_other: string;
  head_style: HeadStyle | "" | null;
  head_style_other: string;
  shank_profile: ShankProfile | "" | null;
  shank_profile_other: string;

  // Sizing & dimensions
  ring_size: string;        // US/EU/JP — free text for v1 (e.g. "6.5 US")
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  metal_weight_g: number | null;
};
```

Default empty spec: `createEmptyProductSpecs()` returns all strings `""`, numbers `null`, `stones: []`.

### 3.3 Backend validation

Pydantic model `ProductSpecs` mirrors the TS shape in `backend/app/schemas/product_specs.py`. `ScenePatch.product_specs` accepts the full object (replace semantics, not deep merge). Validate:

- `carat`, `total_carat`, dimensions, `metal_weight_g` ≥ 0 when set
- `stone_count`, `quantity` ≥ 1 when set
- Enum fields must match allowed values or empty string / null
- `stones` array max 20 entries (v1 guard)

---

## 4. UI design

### 4.1 Editor rail

- Add tab id `"specs"` to `EditorTabId`
- Icon: `ClipboardList` (lucide) — distinct from Settings gear
- Position: **immediately after Settings** (second tab in rail)
- Label: **Specs** (sr-only + title tooltip)

### 4.2 Specs tab layout

Scrollable panel, same chrome as `EditorSettingsTab` (padding, section headings, primary action at bottom).

**Sections (collapsible `Accordion` or stacked `fieldset` with `legend`):**

| Section | Fields |
|---------|--------|
| **Metal** | Metal type (text), Purity (text), Hallmark (text) |
| **Finish** | Select: Polished, Brushed, Satin, Hammered, Sandblasted |
| **Stones** | Stone count, Total carat; **Add stone** button → repeatable rows (gem type, carat, clarity, color, fancy color if needed, cut, qty); remove row |
| **Setting** | Setting type (select + Other text), Head style (select + Other), Shank profile (select + Other) |
| **Sizing** | Ring size (text), Length/Width/Height (mm, number inputs), Metal weight (g) |

**Actions:**

- **Suggest from materials** (secondary) — reads active band/head metal slot + gem slots from store; pre-fills metal type, finish (parsed from catalog slug), and stone rows with gem type from slot labels. Does not auto-save; user reviews then clicks Update.
- **Update specs** (primary) — PATCH `product_specs`; shows success/error like Settings.

### 4.3 Component structure

```
src/features/editor/ui/EditorSpecsTab.tsx       — tab shell, save, suggest
src/features/editor/ui/specs/
  MetalSpecsSection.tsx
  FinishSpecsSection.tsx
  StonesSpecsSection.tsx
  SettingSpecsSection.tsx
  SizingSpecsSection.tsx
src/lib/product-specs/
  types.ts
  defaults.ts
  suggest-from-materials.ts   — maps slot_selections + catalog index → partial ProductSpecs
  parse-catalog-metal.ts      — reuse map-to-preset finish parsing
```

Follow existing editor patterns: controlled local state, `useEffect` sync when `initialSpecs` prop changes, no Zustand for specs (scene field, not render state).

### 4.4 Page wiring

`src/app/model/[id]/page.tsx` — pass `scene.product_specs` into `ModelEditorShell` → `EditorTabRail` → `EditorSpecsTab`.

`Scene` / `ScenePatch` types in `src/lib/api/scenes.ts` gain `product_specs?: ProductSpecs`.

---

## 5. API changes

| Layer | Change |
|-------|--------|
| `backend/app/models/scene.py` | `product_specs` JSON column |
| Alembic | New migration |
| `backend/app/schemas/product_specs.py` | `ProductSpecs` model |
| `backend/app/schemas/scene.py` | Add to list/detail/patch |
| `backend/app/features/scene/service.py` | `apply_patch` handles `product_specs` |
| `src/lib/api/scenes.ts` | Types + patch field |
| `src/features/scene/` | Re-export if needed |

No new routes — existing `PATCH /api/scenes/{id}` and `PATCH /api/scenes/by-model/{viewerId}`.

---

## 6. Suggest-from-materials behavior

When user clicks **Suggest from materials**:

1. Read `slotSelections` from material store and `modelConfig.slots` for slot kinds.
2. **Metal:** first `Metal` or `Heads` slot with a `catalog:*` or built-in metal ref → map slug to display name (e.g. `gold-14k-yellow-brushed` → metal type "14K Yellow Gold", finish "brushed").
3. **Stones:** each `Gem` slot → one `StoneSpec` row with `gem_type` from catalog gem name or preset id; `quantity: 1`; carat/clarity/color left empty.
4. Merge into form state (non-destructive for fields user already filled — only fill empty fields unless user confirms overwrite; v1: fill empty only).

---

## 7. Error handling

- PATCH validation errors → inline field messages (422 from FastAPI)
- Network failure → banner in tab (same as Settings)
- Malformed stored JSON on load → coerce to `createEmptyProductSpecs()` client-side; log warning

---

## 8. Testing

**Backend**

- `test_scene_patch_product_specs` — create scene, patch specs, reload, assert round-trip
- Validation rejects negative carat, invalid enum

**Manual smoke**

1. Open model editor → Specs tab visible
2. Fill all sections → Update → reload page → values persist
3. Suggest from materials with metals/gems applied → fields pre-fill
4. Settings tab and material auto-persist still work

---

## 9. Implementation order

1. Backend: model + migration + schema + patch
2. Frontend types + API types
3. `EditorSpecsTab` + sections (static forms)
4. Wire tab into `EditorTabRail` + page
5. `suggest-from-materials` helper
6. Tests + smoke

---

## 10. Future (explicitly deferred)

- Per-variant specs snapshots
- Display specs on public gallery / embed
- Cert number, price, collection fields
- Ring size unit toggle (US / EU / JP)
- Deep link to stone cut viewer (`/stones`) from cut field
- Bulk import from CSV
