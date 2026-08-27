"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import { cn } from "@/lib/utils";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import type { MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import {
  MATERIAL_GROUPS,
  type MaterialGroup,
  type SlotId,
} from "@/features/viewer/ui/studio-material-groups";
import { useStudioSlotContext } from "@/features/viewer/ui/useStudioSlotContext";
import { SlotTargetGrid } from "@/features/viewer/ui/SlotTargetGrid";

function filterGroupsByKind(kind: "metal" | "gem"): MaterialGroup[] {
  return MATERIAL_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      kind === "gem" ? isGemPresetId(item.id) : !isGemPresetId(item.id),
    ),
  })).filter((group) => group.items.length > 0);
}

type MaterialKindPickerProps = {
  kind: "metal" | "gem";
  modelConfig?: PersistedModelConfig;
  activeSlot: SlotId;
  onActiveSlotChange: (slot: SlotId) => void;
  className?: string;
};

export function MaterialKindPicker({
  kind,
  modelConfig = buildModelConfigFromSlots([]),
  activeSlot,
  onActiveSlotChange,
  className,
}: MaterialKindPickerProps) {
  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);

  const groups = useMemo(() => filterGroupsByKind(kind), [kind]);
  const {
    preset,
    slotAliasMap,
    slotIds: kindSlotIds,
    resolvedActiveSlot,
    activePhysicalSlots,
    safeSlotSelections,
    selectedPresetForActiveSlot,
  } = useStudioSlotContext({ modelConfig, activeSlot, kind });

  function applyPreset(id: MaterialPresetId) {
    for (const slot of activePhysicalSlots) setSlotPreset(slot, id);
    setPreset(id);
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-0 overflow-hidden", className)}>
      <div className="space-y-3 px-4 pt-3">
        {kindSlotIds.length > 0 ? (
          <div className="rounded-md border border-black/10 bg-white/40 p-2.5">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="text-[10px] font-medium uppercase tracking-[0.16em] text-black/70">
                {kind === "gem" ? "Gem slots" : "Metal slots"}
              </h4>
              <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-black/35">
                Target
              </span>
            </div>
            <SlotTargetGrid
              slotIds={kindSlotIds}
              slotAliasMap={slotAliasMap}
              resolvedActiveSlot={resolvedActiveSlot}
              safeSlotSelections={safeSlotSelections}
              onActiveSlotChange={onActiveSlotChange}
            />
          </div>
        ) : null}
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-black/40">
          Catalog
        </p>
      </div>

      <div className="mt-1 flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-5">
          {groups.map((group, gi) => (
            <motion.section
              key={group.title}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.025, duration: 0.25 }}
              aria-label={group.title}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-black/70">
                  {group.title}
                </h3>
                {group.tagline ? (
                  <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-black/35">
                    {group.tagline}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-4 gap-1 sm:grid-cols-5">
                {group.items.map((item) => {
                  const selected =
                    selectedPresetForActiveSlot === item.id ||
                    (activePhysicalSlots.length === 0 && preset === item.id);
                  return (
                    <MaterialSwatch
                      key={item.id}
                      id={item.id}
                      label={item.label}
                      selected={selected}
                      onClick={() => applyPreset(item.id)}
                      variant="paper"
                    />
                  );
                })}
              </div>
            </motion.section>
          ))}
        </div>
      </div>
    </div>
  );
}
