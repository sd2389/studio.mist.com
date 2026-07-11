"use client";

import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { SlotId } from "@/features/viewer/ui/studio-material-groups";
import { MaterialKindPicker } from "@/features/viewer/ui/material-kind-picker";

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
    <MaterialKindPicker
      kind="metal"
      modelConfig={modelConfig}
      activeSlot={activeSlot}
      onActiveSlotChange={onActiveSlotChange}
      className={className}
    />
  );
}
