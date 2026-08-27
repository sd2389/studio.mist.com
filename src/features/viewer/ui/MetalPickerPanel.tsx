"use client";

import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { SlotId } from "@/features/viewer/ui/studio-material-groups";
import { MaterialKindPicker } from "@/features/viewer/ui/material-kind-picker";
import { FinishChipRow } from "@/features/viewer/ui/FinishChipRow";
import { cn } from "@/lib/utils";

type MetalPickerPanelProps = {
  modelConfig?: PersistedModelConfig;
  activeSlot: SlotId;
  onActiveSlotChange: (slot: SlotId) => void;
  className?: string;
};

export function MetalPickerPanel({
  modelConfig,
  activeSlot,
  onActiveSlotChange,
  className,
}: MetalPickerPanelProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <MaterialKindPicker
        kind="metal"
        modelConfig={modelConfig}
        activeSlot={activeSlot}
        onActiveSlotChange={onActiveSlotChange}
        className="min-h-0 flex-1"
      />
      <FinishChipRow />
    </div>
  );
}
