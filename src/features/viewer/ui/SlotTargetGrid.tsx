"use client";

import { cn } from "@/lib/utils";
import type { SlotSelectionMap } from "@/lib/slot-materials/material-rules";
import {
  resolveGroupedPreset,
  slotKind,
  type SlotId,
} from "@/features/viewer/ui/studio-material-groups";
import {
  resolveSelectionIsGem,
  resolveSelectionSwatchColor,
} from "@/features/viewer/ui/studio-selection-utils";

type SlotTargetGridProps = {
  slotIds: string[];
  slotAliasMap: Record<string, string[]>;
  resolvedActiveSlot: string;
  safeSlotSelections: SlotSelectionMap;
  onActiveSlotChange: (slot: SlotId) => void;
  className?: string;
};

export function SlotTargetGrid({
  slotIds,
  slotAliasMap,
  resolvedActiveSlot,
  safeSlotSelections,
  onActiveSlotChange,
  className,
}: SlotTargetGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-1.5", className)}>
      {slotIds.map((slot) => {
        const active = resolvedActiveSlot === slot;
        const logicalSlots = slotAliasMap[slot] ?? [slot];
        const selectedPreset = resolveGroupedPreset(logicalSlots, safeSlotSelections);
        const isSelectedGem = selectedPreset
          ? resolveSelectionIsGem(selectedPreset)
          : slotKind(slot) === "gem";
        const swatchColor = selectedPreset
          ? resolveSelectionSwatchColor(selectedPreset)
          : "#6b7280";
        return (
          <button
            key={slot}
            type="button"
            onClick={() => onActiveSlotChange(slot)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors",
              active
                ? "border-foreground/45 bg-background shadow-sm"
                : "border-border/70 bg-transparent hover:border-foreground/25 hover:bg-background/70",
            )}
          >
            <span
              className={cn(
                "block shrink-0",
                isSelectedGem ? "size-2.5 rotate-45 rounded-[2px]" : "size-2.5 rounded-full",
              )}
              style={{ backgroundColor: swatchColor }}
            />
            <span className="truncate text-[10.5px] font-medium leading-none text-foreground/85">
              {slot}
            </span>
          </button>
        );
      })}
    </div>
  );
}
