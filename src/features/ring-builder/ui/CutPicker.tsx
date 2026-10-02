"use client";

import type { CadCutId } from "@/lib/jewelry-cad";
import { CUT_OPTIONS } from "@/features/ring-builder/domain/design-options";
import { FieldLabel } from "@/features/ring-builder/ui/controls";
import { CutGlyph } from "@/features/ring-builder/ui/glyphs";
import { cn } from "@/lib/utils";

export function CutPicker({ value, onChange }: { value: CadCutId; onChange: (id: CadCutId) => void }) {
  const current = CUT_OPTIONS.find((c) => c.value === value);
  return (
    <div role="radiogroup" aria-label="Stone cut">
      <FieldLabel value={current ? `${current.label} · ${current.family}` : undefined}>Cut</FieldLabel>
      <div className="grid grid-cols-5 gap-1.5">
        {CUT_OPTIONS.map((c) => {
          const selected = c.value === value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={c.label}
              title={c.label}
              onClick={() => onChange(c.value)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl border transition duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-holo/40",
                selected
                  ? "border-foreground bg-surface text-foreground shadow-[0_8px_20px_-14px_rgba(0,0,0,0.7)]"
                  : "border-foreground/[0.06] bg-muted text-foreground/55 hover:border-foreground/20 hover:bg-surface hover:text-foreground",
              )}
            >
              <CutGlyph cut={c.value} className="size-8 sm:size-9" />
              <span className="text-[9.5px] tracking-[0.01em]">{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
