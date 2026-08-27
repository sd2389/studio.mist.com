"use client";

import { cn } from "@/lib/utils";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { LIGHTING } from "@/features/viewer/ui/studio-material-groups";

type LightPickerPanelProps = {
  className?: string;
};

export function LightPickerPanel({ className }: LightPickerPanelProps) {
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const setLighting = useMaterialPresetStore((s) => s.setLighting);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5 pt-4", className)}>
      <section>
        <h3 className="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
          Lighting
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {LIGHTING.map((L) => {
            const Icon = L.icon;
            const active = lighting === L.id;
            return (
              <button
                key={L.id}
                type="button"
                onClick={() => setLighting(L.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border bg-card/60 px-2 py-3 text-center transition-colors",
                  "border-border/60",
                  active
                    ? "border-foreground/45 bg-card shadow-sm"
                    : "hover:border-foreground/25 hover:bg-card",
                )}
                aria-pressed={active}
              >
                <Icon
                  className={cn(
                    "size-4 transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-[10.5px] font-medium leading-tight tracking-tight",
                    active ? "text-foreground" : "text-foreground/75",
                  )}
                >
                  {L.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
