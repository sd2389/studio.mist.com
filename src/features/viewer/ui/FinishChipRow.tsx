"use client";

import { cn } from "@/lib/utils";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { FINISHES } from "@/features/viewer/ui/studio-material-groups";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";

type FinishChipRowProps = {
  className?: string;
};

/** Compact finish pills for the Metal tab (store-backed; same finishes as More). */
export function FinishChipRow({ className }: FinishChipRowProps) {
  const finish = useMaterialPresetStore((s) => s.finish);
  const setFinish = useMaterialPresetStore((s) => s.setFinish);
  const preset = useMaterialPresetStore((s) => s.preset);
  const applies = preset !== "original" && !isGemPresetId(preset);

  return (
    <div className={cn("shrink-0 border-t border-black/10 px-4 py-3", className)}>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">
        Finish
      </p>
      <div className="flex flex-wrap gap-1.5">
        {FINISHES.map((item) => {
          const active = finish === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={!applies}
              onClick={() => setFinish(item.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-tight transition-colors",
                active
                  ? "border-black bg-black text-white"
                  : "border-black/15 bg-transparent text-black/65 hover:border-black/30 hover:text-black",
                !applies && "cursor-not-allowed opacity-35",
              )}
              aria-pressed={active}
              title={item.hint}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
