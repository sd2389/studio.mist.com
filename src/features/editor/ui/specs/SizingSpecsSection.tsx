"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductSpecs } from "@/lib/product-specs/types";

type Props = {
  value: ProductSpecs;
  onChange: (patch: Partial<ProductSpecs>) => void;
};

function parseNullableFloat(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function SizingSpecsSection({ value, onChange }: Props) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-foreground">Sizing & dimensions</legend>
      <div className="space-y-2">
        <Label htmlFor="spec-ring-size">Ring size</Label>
        <Input
          id="spec-ring-size"
          value={value.ring_size}
          onChange={(e) => onChange({ ring_size: e.target.value })}
          placeholder="e.g. 6.5 US"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="spec-length-mm">Length (mm)</Label>
        <Input
          id="spec-length-mm"
          type="number"
          min={0}
          step="0.01"
          value={value.length_mm ?? ""}
          onChange={(e) => onChange({ length_mm: parseNullableFloat(e.target.value) })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="spec-width-mm">Width (mm)</Label>
        <Input
          id="spec-width-mm"
          type="number"
          min={0}
          step="0.01"
          value={value.width_mm ?? ""}
          onChange={(e) => onChange({ width_mm: parseNullableFloat(e.target.value) })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="spec-height-mm">Height (mm)</Label>
        <Input
          id="spec-height-mm"
          type="number"
          min={0}
          step="0.01"
          value={value.height_mm ?? ""}
          onChange={(e) => onChange({ height_mm: parseNullableFloat(e.target.value) })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="spec-metal-weight">Metal weight (g)</Label>
        <Input
          id="spec-metal-weight"
          type="number"
          min={0}
          step="0.01"
          value={value.metal_weight_g ?? ""}
          onChange={(e) => onChange({ metal_weight_g: parseNullableFloat(e.target.value) })}
        />
      </div>
    </fieldset>
  );
}
