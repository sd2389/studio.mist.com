"use client";

import { Label } from "@/components/ui/label";
import { FINISH_OPTIONS, type ProductSpecs } from "@/lib/product-specs/types";

type Props = {
  value: ProductSpecs;
  onChange: (patch: Partial<ProductSpecs>) => void;
};

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
          className={SELECT_CLASS}
        >
          <option value="">—</option>
          {FINISH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
