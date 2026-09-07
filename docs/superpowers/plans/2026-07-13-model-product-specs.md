# Model Editor Product Specs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Specs tab to the Model Editor where jewelers enter structured product attributes (metal, finish, stones, setting, sizing) persisted on the scene.

**Architecture:** New `product_specs` JSON column on `scenes`, validated by a shared Pydantic model on the backend and mirrored TypeScript types on the frontend. UI is a dedicated `EditorSpecsTab` with five section components; save uses explicit PATCH (same pattern as Settings). Optional `suggest-from-materials` reads slot selections without auto-persisting.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic v2, Next.js App Router, React, Zustand (read-only for suggest), existing `updateScene` API.

**Design spec:** [`docs/superpowers/specs/2026-07-13-model-product-specs-design.md`](../specs/2026-07-13-model-product-specs-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/schemas/product_specs.py` | Pydantic models + validation |
| `backend/app/models/scene.py` | `product_specs` JSON column |
| `backend/alembic/versions/i9j0k1l2m3n4_scene_product_specs.py` | Migration |
| `backend/app/schemas/scene.py` | Expose `product_specs` on list/detail/patch |
| `backend/app/features/scene/service.py` | `apply_patch` + DTO mapping |
| `backend/tests/test_scene_product_specs.py` | Round-trip + validation tests |
| `src/lib/product-specs/types.ts` | TS types + option constants |
| `src/lib/product-specs/defaults.ts` | `createEmptyProductSpecs`, `normalizeProductSpecs` |
| `src/lib/product-specs/parse-catalog-metal.ts` | Slug → display name + finish |
| `src/lib/product-specs/suggest-from-materials.ts` | Slot selections → partial specs |
| `src/features/editor/ui/specs/*.tsx` | Five form sections |
| `src/features/editor/ui/EditorSpecsTab.tsx` | Tab shell, save, suggest |
| `src/features/editor/ui/EditorTabRail.tsx` | New `specs` tab |
| `src/features/editor/ui/ModelEditorShell.tsx` | Pass `productSpecs` state |
| `src/lib/api/scenes.ts` | `ProductSpecs` on Scene/Patch |

---

### Task 1: Backend product_specs schema

**Files:**
- Create: `backend/app/schemas/product_specs.py`
- Test: `backend/tests/test_scene_product_specs.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_scene_product_specs.py
"""Product specs schema validation and scene patch round-trip."""

from datetime import datetime

import pytest
from pydantic import ValidationError

from app.features.scene.service import apply_patch, to_detail
from app.models.scene import Scene
from app.schemas.product_specs import ProductSpecs
from app.schemas.scene import ScenePatch


def test_product_specs_rejects_negative_carat():
    with pytest.raises(ValidationError):
        ProductSpecs(
            metal_type="",
            metal_purity="",
            hallmark="",
            finish=None,
            stone_count=None,
            total_carat=-1.0,
            stones=[],
            setting_type=None,
            setting_type_other="",
            head_style=None,
            head_style_other="",
            shank_profile=None,
            shank_profile_other="",
            ring_size="",
            length_mm=None,
            width_mm=None,
            height_mm=None,
            metal_weight_g=None,
        )


def test_product_specs_accepts_valid_payload():
    specs = ProductSpecs(
        metal_type="18K Yellow Gold",
        metal_purity="75%",
        hallmark="750",
        finish="polished",
        stone_count=1,
        total_carat=1.25,
        stones=[
            {
                "id": "s1",
                "gem_type": "diamond",
                "carat": 1.25,
                "clarity": "VS1",
                "color": "G",
                "fancy_color": "",
                "cut": "round",
                "quantity": 1,
            }
        ],
        setting_type="prong",
        setting_type_other="",
        head_style="solitaire",
        head_style_other="",
        shank_profile="comfort-fit",
        shank_profile_other="",
        ring_size="6.5 US",
        length_mm=None,
        width_mm=None,
        height_mm=None,
        metal_weight_g=4.2,
    )
    assert specs.metal_type == "18K Yellow Gold"
    assert specs.finish == "polished"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scene_product_specs.py::test_product_specs_rejects_negative_carat -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.product_specs'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/schemas/product_specs.py
from typing import Literal

from pydantic import BaseModel, Field, field_validator

FinishSpec = Literal["polished", "brushed", "satin", "hammered", "sandblasted"]
SettingType = Literal["prong", "bezel", "pave", "channel", "tension", "flush", "other"]
ShankProfile = Literal["flat", "comfort-fit", "knife-edge", "rounded", "other"]
HeadStyle = Literal["solitaire", "halo", "three-stone", "cluster", "other"]
StoneCut = Literal[
    "round", "oval", "cushion", "emerald", "pear", "marquise",
    "princess", "radiant", "asscher", "heart", "other",
]
ClarityGrade = Literal[
    "FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3",
]
ColorGrade = Literal[
    "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "fancy",
]


class StoneSpec(BaseModel):
    id: str
    gem_type: str = ""
    carat: float | None = None
    clarity: ClarityGrade | Literal[""] | None = None
    color: ColorGrade | Literal[""] | None = None
    fancy_color: str = ""
    cut: StoneCut | Literal[""] | None = None
    quantity: int = Field(default=1, ge=1)

    @field_validator("carat")
    @classmethod
    def carat_non_negative(cls, value: float | None) -> float | None:
        if value is not None and value < 0:
            raise ValueError("carat must be >= 0")
        return value


class ProductSpecs(BaseModel):
    metal_type: str = ""
    metal_purity: str = ""
    hallmark: str = ""
    finish: FinishSpec | Literal[""] | None = None
    stone_count: int | None = Field(default=None, ge=1)
    total_carat: float | None = None
    stones: list[StoneSpec] = Field(default_factory=list, max_length=20)
    setting_type: SettingType | Literal[""] | None = None
    setting_type_other: str = ""
    head_style: HeadStyle | Literal[""] | None = None
    head_style_other: str = ""
    shank_profile: ShankProfile | Literal[""] | None = None
    shank_profile_other: str = ""
    ring_size: str = ""
    length_mm: float | None = None
    width_mm: float | None = None
    height_mm: float | None = None
    metal_weight_g: float | None = None

    @field_validator("total_carat", "length_mm", "width_mm", "height_mm", "metal_weight_g")
    @classmethod
    def non_negative_floats(cls, value: float | None) -> float | None:
        if value is not None and value < 0:
            raise ValueError("value must be >= 0")
        return value
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scene_product_specs.py::test_product_specs_rejects_negative_carat tests/test_scene_product_specs.py::test_product_specs_accepts_valid_payload -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/product_specs.py backend/tests/test_scene_product_specs.py
git commit -m "feat(backend): add product_specs pydantic schema"
```

---

### Task 2: Scene model + migration

**Files:**
- Modify: `backend/app/models/scene.py`
- Create: `backend/alembic/versions/i9j0k1l2m3n4_scene_product_specs.py`

- [ ] **Step 1: Add column to model**

In `backend/app/models/scene.py`, after `variants`:

```python
product_specs: Mapped[dict] = mapped_column(JSON, default=dict)
```

- [ ] **Step 2: Create migration**

```python
# backend/alembic/versions/i9j0k1l2m3n4_scene_product_specs.py
"""Scene product_specs JSON column.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-07-13 18:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i9j0k1l2m3n4"
down_revision: Union[str, Sequence[str], None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scenes",
        sa.Column("product_specs", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column("scenes", "product_specs")
```

- [ ] **Step 3: Run migration**

Run: `cd backend && .venv/bin/alembic upgrade head`

Expected: migration applies without error

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/scene.py backend/alembic/versions/i9j0k1l2m3n4_scene_product_specs.py
git commit -m "feat(backend): add product_specs column to scenes"
```

---

### Task 3: Scene API — expose and patch product_specs

**Files:**
- Modify: `backend/app/schemas/scene.py`
- Modify: `backend/app/features/scene/service.py`
- Test: `backend/tests/test_scene_product_specs.py`

- [ ] **Step 1: Write failing round-trip test**

Append to `backend/tests/test_scene_product_specs.py`:

```python
def test_apply_patch_persists_product_specs(db):
    from app.models.user import User

    user = User(
        email="specs@example.com",
        password_hash="hash",
        role="user",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    scene = Scene(
        user_id=user.id,
        model_key="models/ring.glb",
        material="original",
        lighting="studio",
        model_config={},
        slot_selections={},
        scene_settings={},
        variants={},
        product_specs={},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)

    payload = ProductSpecs(
        metal_type="Platinum 950",
        metal_purity="950‰",
        hallmark="PT950",
        finish="brushed",
        stone_count=1,
        total_carat=2.0,
        stones=[],
        setting_type="bezel",
        setting_type_other="",
        head_style="solitaire",
        head_style_other="",
        shank_profile="flat",
        shank_profile_other="",
        ring_size="7 US",
        length_mm=None,
        width_mm=None,
        height_mm=None,
        metal_weight_g=6.1,
    )
    apply_patch(scene, ScenePatch(product_specs=payload.model_dump()))
    db.commit()
    db.refresh(scene)

    assert scene.product_specs["metal_type"] == "Platinum 950"
    assert scene.product_specs["finish"] == "brushed"
    assert scene.product_specs["ring_size"] == "7 US"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scene_product_specs.py::test_apply_patch_persists_product_specs -v`

Expected: FAIL — `ScenePatch` has no `product_specs` or `apply_patch` ignores it

- [ ] **Step 3: Update scene schemas**

In `backend/app/schemas/scene.py`, add import:

```python
from app.schemas.product_specs import ProductSpecs
```

Add to `SceneListItem`, `SceneDetail`:

```python
product_specs: dict[str, Any] = Field(default_factory=dict)
```

Add to `ScenePatch`:

```python
product_specs: ProductSpecs | None = None
```

- [ ] **Step 4: Update service mapping and patch**

In `backend/app/features/scene/service.py`, add to `to_list_item` and `to_detail`:

```python
product_specs=scene.product_specs or {},
```

In `apply_patch`, before `scene.updated_at`:

```python
if body.product_specs is not None:
    scene.product_specs = body.product_specs.model_dump()
```

- [ ] **Step 5: Run all product_specs tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scene_product_specs.py -v`

Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/scene.py backend/app/features/scene/service.py backend/tests/test_scene_product_specs.py
git commit -m "feat(backend): patch and return scene product_specs"
```

---

### Task 4: Frontend types and defaults

**Files:**
- Create: `src/lib/product-specs/types.ts`
- Create: `src/lib/product-specs/defaults.ts`
- Modify: `src/lib/api/scenes.ts`

- [ ] **Step 1: Create types**

```typescript
// src/lib/product-specs/types.ts
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
  | "fancy";

export type StoneSpec = {
  id: string;
  gem_type: string;
  carat: number | null;
  clarity: ClarityGrade | "" | null;
  color: ColorGrade | "" | null;
  fancy_color: string;
  cut: StoneCut | "" | null;
  quantity: number;
};

export type ProductSpecs = {
  metal_type: string;
  metal_purity: string;
  hallmark: string;
  finish: FinishSpec | "" | null;
  stone_count: number | null;
  total_carat: number | null;
  stones: StoneSpec[];
  setting_type: SettingType | "" | null;
  setting_type_other: string;
  head_style: HeadStyle | "" | null;
  head_style_other: string;
  shank_profile: ShankProfile | "" | null;
  shank_profile_other: string;
  ring_size: string;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  metal_weight_g: number | null;
};

export const FINISH_OPTIONS: { value: FinishSpec; label: string }[] = [
  { value: "polished", label: "Polished" },
  { value: "brushed", label: "Brushed" },
  { value: "satin", label: "Satin" },
  { value: "hammered", label: "Hammered" },
  { value: "sandblasted", label: "Sandblasted" },
];

export const SETTING_TYPE_OPTIONS: { value: SettingType; label: string }[] = [
  { value: "prong", label: "Prong" },
  { value: "bezel", label: "Bezel" },
  { value: "pave", label: "Pavé" },
  { value: "channel", label: "Channel" },
  { value: "tension", label: "Tension" },
  { value: "flush", label: "Flush" },
  { value: "other", label: "Other" },
];

export const HEAD_STYLE_OPTIONS: { value: HeadStyle; label: string }[] = [
  { value: "solitaire", label: "Solitaire" },
  { value: "halo", label: "Halo" },
  { value: "three-stone", label: "Three-stone" },
  { value: "cluster", label: "Cluster" },
  { value: "other", label: "Other" },
];

export const SHANK_PROFILE_OPTIONS: { value: ShankProfile; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "comfort-fit", label: "Comfort fit" },
  { value: "knife-edge", label: "Knife edge" },
  { value: "rounded", label: "Rounded" },
  { value: "other", label: "Other" },
];

export const STONE_CUT_OPTIONS: { value: StoneCut; label: string }[] = [
  { value: "round", label: "Round" },
  { value: "oval", label: "Oval" },
  { value: "cushion", label: "Cushion" },
  { value: "emerald", label: "Emerald" },
  { value: "pear", label: "Pear" },
  { value: "marquise", label: "Marquise" },
  { value: "princess", label: "Princess" },
  { value: "radiant", label: "Radiant" },
  { value: "asscher", label: "Asscher" },
  { value: "heart", label: "Heart" },
  { value: "other", label: "Other" },
];

export const CLARITY_OPTIONS: ClarityGrade[] = [
  "FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3",
];

export const COLOR_OPTIONS: ColorGrade[] = [
  "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "fancy",
];
```

- [ ] **Step 2: Create defaults**

```typescript
// src/lib/product-specs/defaults.ts
import type { ProductSpecs, StoneSpec } from "./types";

export function createEmptyProductSpecs(): ProductSpecs {
  return {
    metal_type: "",
    metal_purity: "",
    hallmark: "",
    finish: null,
    stone_count: null,
    total_carat: null,
    stones: [],
    setting_type: null,
    setting_type_other: "",
    head_style: null,
    head_style_other: "",
    shank_profile: null,
    shank_profile_other: "",
    ring_size: "",
    length_mm: null,
    width_mm: null,
    height_mm: null,
    metal_weight_g: null,
  };
}

function normalizeStone(raw: unknown): StoneSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : crypto.randomUUID();
  return {
    id,
    gem_type: typeof row.gem_type === "string" ? row.gem_type : "",
    carat: typeof row.carat === "number" ? row.carat : null,
    clarity: (row.clarity as StoneSpec["clarity"]) ?? null,
    color: (row.color as StoneSpec["color"]) ?? null,
    fancy_color: typeof row.fancy_color === "string" ? row.fancy_color : "",
    cut: (row.cut as StoneSpec["cut"]) ?? null,
    quantity: typeof row.quantity === "number" && row.quantity >= 1 ? row.quantity : 1,
  };
}

export function normalizeProductSpecs(raw: unknown): ProductSpecs {
  const base = createEmptyProductSpecs();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Record<string, unknown>;
  const stones = Array.isArray(data.stones)
    ? data.stones.map(normalizeStone).filter((s): s is StoneSpec => s !== null)
    : [];

  return {
    ...base,
    metal_type: typeof data.metal_type === "string" ? data.metal_type : "",
    metal_purity: typeof data.metal_purity === "string" ? data.metal_purity : "",
    hallmark: typeof data.hallmark === "string" ? data.hallmark : "",
    finish: (data.finish as ProductSpecs["finish"]) ?? null,
    stone_count: typeof data.stone_count === "number" ? data.stone_count : null,
    total_carat: typeof data.total_carat === "number" ? data.total_carat : null,
    stones,
    setting_type: (data.setting_type as ProductSpecs["setting_type"]) ?? null,
    setting_type_other: typeof data.setting_type_other === "string" ? data.setting_type_other : "",
    head_style: (data.head_style as ProductSpecs["head_style"]) ?? null,
    head_style_other: typeof data.head_style_other === "string" ? data.head_style_other : "",
    shank_profile: (data.shank_profile as ProductSpecs["shank_profile"]) ?? null,
    shank_profile_other: typeof data.shank_profile_other === "string" ? data.shank_profile_other : "",
    ring_size: typeof data.ring_size === "string" ? data.ring_size : "",
    length_mm: typeof data.length_mm === "number" ? data.length_mm : null,
    width_mm: typeof data.width_mm === "number" ? data.width_mm : null,
    height_mm: typeof data.height_mm === "number" ? data.height_mm : null,
    metal_weight_g: typeof data.metal_weight_g === "number" ? data.metal_weight_g : null,
  };
}

export function productSpecsFromScene(scene: { product_specs?: unknown }): ProductSpecs {
  return normalizeProductSpecs(scene.product_specs);
}
```

- [ ] **Step 3: Update API types**

In `src/lib/api/scenes.ts`, add import and fields:

```typescript
import type { ProductSpecs } from "@/lib/product-specs/types";

// On Scene and SceneDetail:
product_specs?: ProductSpecs;

// On ScenePatch:
product_specs?: ProductSpecs;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

Expected: no new errors in product-specs files (pre-existing errors elsewhere OK)

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-specs/types.ts src/lib/product-specs/defaults.ts src/lib/api/scenes.ts
git commit -m "feat(frontend): add product_specs types and defaults"
```

---

### Task 5: Spec section components

**Files:**
- Create: `src/features/editor/ui/specs/MetalSpecsSection.tsx`
- Create: `src/features/editor/ui/specs/FinishSpecsSection.tsx`
- Create: `src/features/editor/ui/specs/StonesSpecsSection.tsx`
- Create: `src/features/editor/ui/specs/SettingSpecsSection.tsx`
- Create: `src/features/editor/ui/specs/SizingSpecsSection.tsx`

- [ ] **Step 1: Create MetalSpecsSection**

```tsx
// src/features/editor/ui/specs/MetalSpecsSection.tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductSpecs } from "@/lib/product-specs/types";

type Props = {
  value: ProductSpecs;
  onChange: (patch: Partial<ProductSpecs>) => void;
};

export function MetalSpecsSection({ value, onChange }: Props) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-foreground">Metal</legend>
      <div className="space-y-2">
        <Label htmlFor="spec-metal-type">Metal type</Label>
        <Input
          id="spec-metal-type"
          value={value.metal_type}
          onChange={(e) => onChange({ metal_type: e.target.value })}
          placeholder="e.g. 18K Yellow Gold"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="spec-metal-purity">Purity</Label>
        <Input
          id="spec-metal-purity"
          value={value.metal_purity}
          onChange={(e) => onChange({ metal_purity: e.target.value })}
          placeholder="e.g. 75%, 950‰, 925"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="spec-hallmark">Hallmark</Label>
        <Input
          id="spec-hallmark"
          value={value.hallmark}
          onChange={(e) => onChange({ hallmark: e.target.value })}
          placeholder="e.g. 750"
        />
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 2: Create FinishSpecsSection**

```tsx
// src/features/editor/ui/specs/FinishSpecsSection.tsx
"use client";

import { Label } from "@/components/ui/label";
import { FINISH_OPTIONS, type ProductSpecs } from "@/lib/product-specs/types";

type Props = {
  value: ProductSpecs;
  onChange: (patch: Partial<ProductSpecs>) => void;
};

export function FinishSpecsSection({ value, onChange }: Props) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-foreground">Finish</legend>
      <div className="space-y-2">
        <Label htmlFor="spec-finish">Surface finish</Label>
        <select
          id="spec-finish"
          value={value.finish ?? ""}
          onChange={(e) => onChange({ finish: (e.target.value || null) as ProductSpecs["finish"] })}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {FINISH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 3: Create StonesSpecsSection**

Build repeatable stone rows with Add/Remove. Use `crypto.randomUUID()` for new row ids. Fields: gem type, carat (number), clarity select, color select (+ fancy color when `fancy`), cut select, quantity. Top-level stone_count and total_carat number inputs.

- [ ] **Step 4: Create SettingSpecsSection**

Three selects (`SETTING_TYPE_OPTIONS`, `HEAD_STYLE_OPTIONS`, `SHANK_PROFILE_OPTIONS`) each with conditional "Other" text input when value is `"other"`.

- [ ] **Step 5: Create SizingSpecsSection**

Fields: ring_size (text), length_mm, width_mm, height_mm, metal_weight_g (number inputs, `min={0}`, `step="0.01"`).

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/ui/specs/
git commit -m "feat(editor): add product specs form sections"
```

---

### Task 6: EditorSpecsTab shell

**Files:**
- Create: `src/features/editor/ui/EditorSpecsTab.tsx`

- [ ] **Step 1: Implement tab**

Mirror `EditorSettingsTab` structure:
- Props: `sceneId`, `initialSpecs: ProductSpecs`, `onSpecsSaved?: (specs: ProductSpecs) => void`
- Local `specs` state synced via `useEffect` when `initialSpecs` changes
- Render all five section components in a scrollable `div` with `space-y-6 p-4`
- Secondary button **Suggest from materials** (wired in Task 8)
- Primary button **Update specs** calls `updateScene(sceneId, { product_specs: specs })`
- Show `status` message and `busy` loading state like Settings

```tsx
// src/features/editor/ui/EditorSpecsTab.tsx (shell outline)
"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { updateScene } from "@/features/scene";
import { Button } from "@/components/ui/button";
import type { ProductSpecs } from "@/lib/product-specs/types";
import { MetalSpecsSection } from "./specs/MetalSpecsSection";
import { FinishSpecsSection } from "./specs/FinishSpecsSection";
import { StonesSpecsSection } from "./specs/StonesSpecsSection";
import { SettingSpecsSection } from "./specs/SettingSpecsSection";
import { SizingSpecsSection } from "./specs/SizingSpecsSection";

type EditorSpecsTabProps = {
  sceneId: number;
  initialSpecs: ProductSpecs;
  onSpecsSaved?: (specs: ProductSpecs) => void;
  onSuggestFromMaterials?: () => void;
};

export function EditorSpecsTab({ sceneId, initialSpecs, onSpecsSaved, onSuggestFromMaterials }: EditorSpecsTabProps) {
  const [specs, setSpecs] = useState(initialSpecs);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSpecs(initialSpecs); }, [initialSpecs]);

  function patch(patch: Partial<ProductSpecs>) {
    setSpecs((prev) => ({ ...prev, ...patch }));
  }

  async function handleUpdate() {
    setBusy(true);
    setStatus(null);
    try {
      await updateScene(sceneId, { product_specs: specs });
      onSpecsSaved?.(specs);
      setStatus("Specs updated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-6">
        <MetalSpecsSection value={specs} onChange={patch} />
        <FinishSpecsSection value={specs} onChange={patch} />
        <StonesSpecsSection value={specs} onChange={patch} />
        <SettingSpecsSection value={specs} onChange={patch} />
        <SizingSpecsSection value={specs} onChange={patch} />
      </div>
      <div className="shrink-0 space-y-2 border-t border-border p-4">
        <Button type="button" variant="outline" className="w-full" onClick={onSuggestFromMaterials}>
          Suggest from materials
        </Button>
        <Button type="button" className="w-full" onClick={() => void handleUpdate()} disabled={busy}>
          {busy ? <><Loader2 className="mr-2 size-4 animate-spin" />Updating…</> : "Update specs"}
        </Button>
        {status ? <p className="text-xs text-muted-foreground" role="status">{status}</p> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/editor/ui/EditorSpecsTab.tsx
git commit -m "feat(editor): add EditorSpecsTab with save action"
```

---

### Task 7: Wire Specs tab into editor rail

**Files:**
- Modify: `src/features/editor/ui/EditorTabRail.tsx`
- Modify: `src/features/editor/ui/ModelEditorShell.tsx`
- Modify: `src/features/editor/index.ts`

- [ ] **Step 1: Add tab to EditorTabRail**

In `EditorTabRail.tsx`:
- Import `ClipboardList` from lucide
- Import `EditorSpecsTab`
- Add `"specs"` to `EditorTabId` union
- Insert into `TAB_ITEMS` after `settings`: `{ id: "specs", label: "Specs", icon: ClipboardList }`
- Add props: `productSpecs: ProductSpecs`, `onSpecsSaved: (specs: ProductSpecs) => void`, `onSuggestFromMaterials: () => void`
- Add `TabsContent`:

```tsx
<TabsContent value="specs" className="m-0 h-full min-h-0 overflow-hidden">
  <TabPanel label="Specs">
    <EditorSpecsTab
      sceneId={sceneId}
      initialSpecs={productSpecs}
      onSpecsSaved={onSpecsSaved}
      onSuggestFromMaterials={onSuggestFromMaterials}
    />
  </TabPanel>
</TabsContent>
```

- [ ] **Step 2: Wire ModelEditorShell**

```typescript
import { productSpecsFromScene } from "@/lib/product-specs/defaults";
import type { ProductSpecs } from "@/lib/product-specs/types";

// state:
const [productSpecs, setProductSpecs] = useState<ProductSpecs>(() =>
  productSpecsFromScene(initialScene),
);

// pass to EditorTabRail:
productSpecs={productSpecs}
onSpecsSaved={setProductSpecs}
onSuggestFromMaterials={handleSuggestFromMaterials}  // Task 8
```

- [ ] **Step 3: Export from feature index**

```typescript
export { EditorSpecsTab } from "./ui/EditorSpecsTab";
```

- [ ] **Step 4: Manual smoke**

1. Start dev server + backend
2. Open `/model/[id]`
3. Confirm Specs tab (clipboard icon) appears second in rail
4. Fill fields → Update specs → reload → values persist

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/ui/EditorTabRail.tsx src/features/editor/ui/ModelEditorShell.tsx src/features/editor/index.ts
git commit -m "feat(editor): wire Specs tab into model editor rail"
```

---

### Task 8: Suggest from materials helper

**Files:**
- Create: `src/lib/product-specs/parse-catalog-metal.ts`
- Create: `src/lib/product-specs/suggest-from-materials.ts`
- Modify: `src/features/editor/ui/ModelEditorShell.tsx`

- [ ] **Step 1: Create parse-catalog-metal**

```typescript
// src/lib/product-specs/parse-catalog-metal.ts
import type { FinishSpec } from "./types";

const FINISH_SUFFIXES: FinishSpec[] = ["polished", "brushed", "satin", "hammered", "sandblasted"];

const METAL_DISPLAY: Record<string, string> = {
  "gold-24k": "24K Yellow Gold",
  "gold-22k": "22K Yellow Gold",
  "gold-18k-yellow": "18K Yellow Gold",
  "gold-14k-yellow": "14K Yellow Gold",
  "gold-10k-yellow": "10K Yellow Gold",
  "gold-9k-yellow": "9K Yellow Gold",
  "gold-18k-white": "18K White Gold",
  "gold-14k-white": "14K White Gold",
  "gold-10k-white": "10K White Gold",
  "gold-18k-rose": "18K Rose Gold",
  "gold-14k-rose": "14K Rose Gold",
  platinum: "Platinum",
  "silver-sterling": "Sterling Silver",
  titanium: "Titanium",
  "rhodium-black": "Black Rhodium",
};

export function parseFinishFromSlug(slug: string): FinishSpec {
  for (const finish of FINISH_SUFFIXES) {
    if (slug.endsWith(`-${finish}`)) return finish;
  }
  return "polished";
}

export function parseBaseMetalSlug(slug: string): string {
  for (const finish of FINISH_SUFFIXES) {
    const suffix = `-${finish}`;
    if (slug.endsWith(suffix)) return slug.slice(0, -suffix.length);
  }
  return slug;
}

export function metalDisplayNameFromSlug(slug: string): string {
  const base = parseBaseMetalSlug(slug);
  return METAL_DISPLAY[base] ?? base.replace(/-/g, " ");
}
```

- [ ] **Step 2: Create suggest-from-materials**

```typescript
// src/lib/product-specs/suggest-from-materials.ts
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { GemItem, MetalItem } from "@/lib/catalog/types";
import type { ProductSpecs, StoneSpec } from "./types";
import { metalDisplayNameFromSlug, parseFinishFromSlug } from "./parse-catalog-metal";

type Args = {
  specs: ProductSpecs;
  slotSelections: Record<string, string>;
  modelConfig: PersistedModelConfig;
  metalsBySlug: Map<string, MetalItem>;
  gemsBySlug: Map<string, GemItem>;
};

function isEmpty(value: string | null | undefined): boolean {
  return value == null || value === "";
}

function resolveCatalogSlug(ref: string): string | null {
  if (!ref.startsWith("catalog:")) return null;
  return ref.slice("catalog:".length);
}

export function suggestProductSpecsFromMaterials(args: Args): ProductSpecs {
  const { specs, slotSelections, modelConfig, metalsBySlug, gemsBySlug } = args;
  const next = { ...specs, stones: [...specs.stones] };

  const slots = modelConfig.slots ?? [];
  const metalSlot = slots.find(
    (s) => (s.kind === "metal" || s.kind === "heads") && slotSelections[s.id],
  );
  if (metalSlot) {
    const ref = slotSelections[metalSlot.id];
    const catalogSlug = resolveCatalogSlug(ref);
    if (catalogSlug) {
      const item = metalsBySlug.get(catalogSlug);
      const slug = item?.slug ?? catalogSlug;
      if (isEmpty(next.metal_type)) next.metal_type = metalDisplayNameFromSlug(slug);
      if (next.finish == null || next.finish === "") next.finish = parseFinishFromSlug(slug);
    } else if (isEmpty(next.metal_type)) {
      next.metal_type = ref.replace(/-/g, " ");
    }
  }

  const gemSlots = slots.filter((s) => s.kind === "gem" && slotSelections[s.id]);
  if (gemSlots.length > 0 && next.stones.length === 0) {
    next.stones = gemSlots.map((slot): StoneSpec => {
      const ref = slotSelections[slot.id];
      const catalogSlug = resolveCatalogSlug(ref);
      const gemName = catalogSlug ? gemsBySlug.get(catalogSlug)?.name ?? catalogSlug : ref;
      return {
        id: crypto.randomUUID(),
        gem_type: gemName,
        carat: null,
        clarity: null,
        color: null,
        fancy_color: "",
        cut: null,
        quantity: 1,
      };
    });
    if (next.stone_count == null) next.stone_count = next.stones.length;
  }

  return next;
}
```

- [ ] **Step 3: Wire in ModelEditorShell**

Build `metalsBySlug` / `gemsBySlug` maps from `initialMetals` / `initialGems` props. In `handleSuggestFromMaterials`:

```typescript
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { suggestProductSpecsFromMaterials } from "@/lib/product-specs/suggest-from-materials";

function handleSuggestFromMaterials() {
  const slotSelections = useMaterialPresetStore.getState().slotSelections;
  setProductSpecs((prev) =>
    suggestProductSpecsFromMaterials({
      specs: prev,
      slotSelections,
      modelConfig,
      metalsBySlug,
      gemsBySlug,
    }),
  );
}
```

Pass `handleSuggestFromMaterials` to `EditorTabRail`.

- [ ] **Step 4: Smoke suggest flow**

1. Apply metal + gem materials on model
2. Open Specs tab → Suggest from materials
3. Empty fields fill; existing user-entered values remain

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-specs/parse-catalog-metal.ts src/lib/product-specs/suggest-from-materials.ts src/features/editor/ui/ModelEditorShell.tsx
git commit -m "feat(editor): suggest product specs from slot materials"
```

---

### Task 9: Update design spec status + final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-model-product-specs-design.md`

- [ ] **Step 1: Mark spec approved**

Change status line to: `**Status:** Approved — implementation in progress`

- [ ] **Step 2: Run backend tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scene_product_specs.py -v`

Expected: all PASS

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: no new errors from this feature

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-13-model-product-specs-design.md
git commit -m "docs: mark product specs design approved"
```

---

## Self-review checklist

| Spec requirement | Task |
|------------------|------|
| `product_specs` JSON column | Task 2 |
| Pydantic validation | Task 1 |
| Scene PATCH round-trip | Task 3 |
| TS types + defaults | Task 4 |
| Five form sections | Task 5 |
| Specs tab in rail (2nd position) | Task 7 |
| Explicit Update specs save | Task 6 |
| Suggest from materials (fill empty only) | Task 8 |
| Independent of 3D materials | Tasks 6–8 (no store writes on save) |
| Backend tests | Tasks 1, 3 |

No placeholders remain. Type names consistent across backend `ProductSpecs`, frontend `ProductSpecs`, and `ScenePatch.product_specs`.
