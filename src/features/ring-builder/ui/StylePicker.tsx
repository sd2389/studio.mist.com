"use client";

import type { PresetId } from "@/lib/jewelry-cad";
import { STYLE_OPTIONS } from "@/features/ring-builder/domain/design-options";
import { StyleGlyph } from "@/features/ring-builder/ui/glyphs";
import { cn } from "@/lib/utils";

/** Style cards: a horizontal rail on phones, a 3×3 grid from `sm` up. */
export function StylePicker({ value, onChange }: { value: PresetId; onChange: (id: PresetId) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Style"
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {STYLE_OPTIONS.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "group flex w-[86px] shrink-0 snap-start flex-col items-center gap-1.5 rounded-[1.1rem] border px-2 pb-2.5 pt-3 transition duration-200 sm:w-auto",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-holo/40",
              selected
                ? "border-foreground bg-foreground text-background shadow-[0_10px_24px_-14px_rgba(0,0,0,0.7)]"
                : "border-foreground/[0.07] bg-muted text-foreground/70 hover:border-foreground/20 hover:bg-surface hover:text-foreground",
            )}
          >
            <StyleGlyph style={o.value} className="size-9" />
            <span className="text-[11px] tracking-[-0.01em]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
