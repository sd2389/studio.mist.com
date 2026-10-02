"use client";

import { useState } from "react";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import {
  FANCY_GRADES,
  FANCY_HUES,
  fancyDiamondId,
  fancyDiamondLabel,
  parseFancyDiamondId,
  type FancyGradeId,
} from "@/lib/gem-gpu/fancy-diamonds";
import { cn } from "@/lib/utils";
import type { MaterialPresetId } from "@/stores/material-preset-store";

type FancyDiamondPickerProps = {
  /** The active slot's material: a preset id or a catalogue/custom reference. */
  selected: string | null;
  onSelect: (id: MaterialPresetId) => void;
};

/** Fancy-colour diamonds: a hue, then its GIA intensity grade. */
export function FancyDiamondPicker({ selected, onSelect }: FancyDiamondPickerProps) {
  const current = parseFancyDiamondId(selected);
  const [pickedGrade, setPickedGrade] = useState<FancyGradeId>("intense");
  const grade = current?.grade ?? pickedGrade;

  function chooseGrade(next: FancyGradeId) {
    setPickedGrade(next);
    if (current) onSelect(fancyDiamondId(current.hue, next));
  }

  return (
    <section aria-label="Fancy colour diamonds">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/70">Fancy Colour</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/35">GIA grades</span>
      </div>
      <div
        role="radiogroup"
        aria-label="Colour grade"
        className="mb-2 grid grid-cols-5 gap-0.5 rounded-md border border-foreground/10 bg-surface/40 p-0.5"
      >
        {FANCY_GRADES.map((g) => (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={grade === g.id}
            title={g.label}
            onClick={() => chooseGrade(g.id)}
            className={cn(
              "rounded px-1 py-1 font-mono text-[10px] uppercase tracking-[0.24em] transition-colors",
              grade === g.id ? "bg-foreground text-background" : "text-foreground/50 hover:text-foreground",
            )}
          >
            {g.short}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Fancy colour hue" className="grid grid-cols-4 gap-1 sm:grid-cols-5">
        {FANCY_HUES.map((hue) => {
          const id = fancyDiamondId(hue.id, grade);
          return (
            <MaterialSwatch
              key={hue.id}
              id={id}
              label={hue.label}
              selected={selected === id}
              onClick={() => onSelect(id)}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-foreground/45" aria-live="polite">
        {current ? fancyDiamondLabel(current.hue, current.grade) : "Pick a hue to set a fancy-colour diamond."}
      </p>
    </section>
  );
}
