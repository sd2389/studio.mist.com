"use client";

import { FeatureGate } from "@/features/feature-flags";
import { cn } from "@/lib/utils";

export type AiVisualsEntry = "background" | "model";

type AiVisualsEntryPickerProps = {
  entry: AiVisualsEntry;
  onSelectBackground: () => void;
  onSelectModel: () => void;
};

export function AiVisualsEntryPicker({
  entry,
  onSelectBackground,
  onSelectModel,
}: AiVisualsEntryPickerProps) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Entry
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSelectBackground}
          className={cn(
            "rounded-lg border px-2 py-2 text-left transition-colors",
            entry === "background"
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-background hover:bg-muted",
          )}
        >
          <p className="text-sm font-medium">Background</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            Preset studio scenes or a custom prompt.
          </p>
        </button>
        <FeatureGate feature="ai_on_model">
          <button
            type="button"
            onClick={onSelectModel}
            className={cn(
              "rounded-lg border px-2 py-2 text-left transition-colors",
              entry === "model"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <p className="text-sm font-medium">Model</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              Jewelry on an AI model (hand, neck, or ear).
            </p>
          </button>
        </FeatureGate>
      </div>
    </div>
  );
}
