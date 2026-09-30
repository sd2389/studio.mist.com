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
