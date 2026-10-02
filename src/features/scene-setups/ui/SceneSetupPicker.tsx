"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCENE_SETUPS, type SceneSetupId } from "../domain/scene-setups";

type SceneSetupPickerProps = {
  value: SceneSetupId;
  onChange: (id: SceneSetupId) => void;
  className?: string;
};

export function SceneSetupPicker({ value, onChange, className }: SceneSetupPickerProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {SCENE_SETUPS.map((setup) => {
        const active = setup.id === value;
        return (
          <button
            key={setup.id}
            type="button"
            onClick={() => onChange(setup.id)}
            aria-pressed={active}
            title={setup.description}
            className={cn(
              "group relative overflow-hidden rounded-2xl border text-left transition-colors",
              active ? "border-foreground/50 shadow-sm" : "border-border/60 hover:border-foreground/25",
            )}
          >
            <span className="block h-14 w-full" style={{ background: setup.swatch }} aria-hidden />
            <span className="flex items-center justify-between gap-1 bg-card/80 px-2.5 py-2">
              <span className={cn("truncate text-[10.5px] font-medium tracking-tight", active ? "text-foreground" : "text-foreground/75")}>
                {setup.label}
              </span>
              {active ? <Check className="size-3 shrink-0 text-foreground" aria-hidden /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
