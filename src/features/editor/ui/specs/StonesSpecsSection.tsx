"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLARITY_OPTIONS,
  COLOR_OPTIONS,
  STONE_CUT_OPTIONS,
  type ProductSpecs,
  type StoneSpec,
} from "@/lib/product-specs/types";

type Props = {
  value: ProductSpecs;
  onChange: (patch: Partial<ProductSpecs>) => void;
};

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MAX_STONES = 20;

function parseNullableFloat(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseNullableInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

function parseQuantity(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function createEmptyStone(): StoneSpec {
  return {
    id: crypto.randomUUID(),
    gem_type: "",
    carat: null,
    clarity: null,
    color: null,
    fancy_color: "",
    cut: null,
    quantity: 1,
  };
}

export function StonesSpecsSection({ value, onChange }: Props) {
  function updateStone(id: string, patch: Partial<StoneSpec>) {
    onChange({
      stones: value.stones.map((stone) => (stone.id === id ? { ...stone, ...patch } : stone)),
    });
  }

  function addStone() {
    if (value.stones.length >= MAX_STONES) return;
    onChange({ stones: [...value.stones, createEmptyStone()] });
  }

  function removeStone(id: string) {
    onChange({ stones: value.stones.filter((stone) => stone.id !== id) });
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-foreground">Stones</legend>

      <div className="space-y-2">
        <Label htmlFor="spec-stone-count">Stone count</Label>
        <Input
          id="spec-stone-count"
          type="number"
          min={1}
          step={1}
          value={value.stone_count ?? ""}
          onChange={(e) => onChange({ stone_count: parseNullableInt(e.target.value) })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="spec-total-carat">Total carat</Label>
        <Input
          id="spec-total-carat"
          type="number"
          min={0}
          step="0.01"
          value={value.total_carat ?? ""}
          onChange={(e) => onChange({ total_carat: parseNullableFloat(e.target.value) })}
        />
      </div>

      <div className="space-y-4">
        {value.stones.map((stone, index) => (
          <div key={stone.id} className="space-y-3 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Stone {index + 1}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeStone(stone.id)}>
                Remove
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`spec-gem-type-${stone.id}`}>Gem type</Label>
              <Input
                id={`spec-gem-type-${stone.id}`}
                value={stone.gem_type}
                onChange={(e) => updateStone(stone.id, { gem_type: e.target.value })}
                placeholder="e.g. diamond"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`spec-carat-${stone.id}`}>Carat</Label>
              <Input
                id={`spec-carat-${stone.id}`}
                type="number"
                min={0}
                step="0.01"
                value={stone.carat ?? ""}
                onChange={(e) => updateStone(stone.id, { carat: parseNullableFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`spec-clarity-${stone.id}`}>Clarity</Label>
              <select
                id={`spec-clarity-${stone.id}`}
                value={stone.clarity ?? ""}
                onChange={(e) =>
                  updateStone(stone.id, {
                    clarity: (e.target.value || null) as StoneSpec["clarity"],
                  })
                }
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {CLARITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`spec-color-${stone.id}`}>Color</Label>
              <select
                id={`spec-color-${stone.id}`}
                value={stone.color ?? ""}
                onChange={(e) =>
                  updateStone(stone.id, {
                    color: (e.target.value || null) as StoneSpec["color"],
                  })
                }
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {COLOR_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === "fancy" ? "Fancy" : opt}
                  </option>
                ))}
              </select>
              {stone.color === "fancy" ? (
                <Input
                  id={`spec-fancy-color-${stone.id}`}
                  value={stone.fancy_color}
                  onChange={(e) => updateStone(stone.id, { fancy_color: e.target.value })}
                  placeholder="Fancy color"
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`spec-cut-${stone.id}`}>Cut</Label>
              <select
                id={`spec-cut-${stone.id}`}
                value={stone.cut ?? ""}
                onChange={(e) =>
                  updateStone(stone.id, { cut: (e.target.value || null) as StoneSpec["cut"] })
                }
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {STONE_CUT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`spec-quantity-${stone.id}`}>Quantity</Label>
              <Input
                id={`spec-quantity-${stone.id}`}
                type="number"
                min={1}
                step={1}
                value={stone.quantity}
                onChange={(e) => updateStone(stone.id, { quantity: parseQuantity(e.target.value) })}
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={addStone}
        disabled={value.stones.length >= MAX_STONES}
      >
        Add stone
      </Button>
    </fieldset>
  );
}
