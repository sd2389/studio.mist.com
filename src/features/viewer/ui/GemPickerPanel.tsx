"use client";

import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { SlotId } from "@/features/viewer/ui/studio-material-groups";
import { MaterialKindPicker } from "@/features/viewer/ui/material-kind-picker";

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
    <MaterialKindPicker
      kind="gem"
      modelConfig={modelConfig}
      activeSlot={activeSlot}
      onActiveSlotChange={onActiveSlotChange}
      className={className}
    />
  );
}
