"use client";

import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { SlotId } from "@/features/viewer/ui/studio-material-groups";
import { MaterialKindPicker } from "@/features/viewer/ui/material-kind-picker";
import { GemScopeCard } from "@/features/viewer/ui/GemScopeCard";
import { cn } from "@/lib/utils";

type GemPickerPanelProps = {
  modelConfig?: PersistedModelConfig;
  activeSlot: SlotId;
  onActiveSlotChange: (slot: SlotId) => void;
  className?: string;
};

export function GemPickerPanel({
  modelConfig,
  activeSlot,
  onActiveSlotChange,
  className,
}: GemPickerPanelProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <MaterialKindPicker
        kind="gem"
        modelConfig={modelConfig}
        activeSlot={activeSlot}
        onActiveSlotChange={onActiveSlotChange}
        className="min-h-0 flex-1"
      />
      <GemScopeCard />
    </div>
  );
}
