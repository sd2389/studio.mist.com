"use client";

import type { ModelVariant } from "@/lib/variants/types";
import { cn } from "@/lib/utils";

type VariantMultiSelectProps = {
  items: ModelVariant[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function VariantMultiSelect({
  items,
  selectedIds,
  onChange,
  disabled = false,
}: VariantMultiSelectProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Save variants in Settings to batch-export multiple looks.
      </p>
    );
  }

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((value) => value !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll() {
    onChange(items.map((item) => item.id));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Variants
        </p>
        <div className="flex gap-2 text-[10px]">
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={selectAll}
          >
            All
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={clearAll}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {items.map((variant) => {
          const checked = selectedIds.includes(variant.id);
          return (
            <label
              key={variant.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                checked ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(variant.id)}
              />
              <span className="truncate">{variant.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
