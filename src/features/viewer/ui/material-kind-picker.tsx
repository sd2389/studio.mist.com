"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import { cn } from "@/lib/utils";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { resolvePresetForSlot, sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import type { MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import {
  MATERIAL_GROUPS,
  resolveGroupedPreset,
  slotKind,
  type MaterialGroup,
  type SlotId,
} from "@/features/viewer/ui/studio-material-groups";
import {
  buildSlotAliasMap,
  filterSlotsByKind,
  resolveSelectionIsGem,
  resolveSelectionSwatchColor,
  shouldCollapseGemSlots,
} from "@/features/viewer/ui/studio-selection-utils";

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
  const preset = useMaterialPresetStore((s) => s.preset);
  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);

  const groups = useMemo(() => filterGroupsByKind(kind), [kind]);
  const collapseGemSlots = useMemo(() => shouldCollapseGemSlots(modelConfig), [modelConfig]);
  const slotAliasMap = useMemo(
    () => buildSlotAliasMap(modelConfig, slotSelections, collapseGemSlots),
    [modelConfig, slotSelections, collapseGemSlots],
  );
  const kindSlotIds = useMemo(
    () => filterSlotsByKind(Object.keys(slotAliasMap), kind),
    [slotAliasMap, kind],
  );
  const defaultSlot = kindSlotIds[0] ?? (kind === "gem" ? "Gem 1" : "Metal 1");
  const resolvedActiveSlot = kindSlotIds.includes(activeSlot) ? activeSlot : defaultSlot;
  const activePhysicalSlots = useMemo(
    () => slotAliasMap[resolvedActiveSlot] ?? [resolvedActiveSlot],
    [slotAliasMap, resolvedActiveSlot],
  );
  const safeSlotSelections = useMemo(
    () => sanitizeSlotSelections(slotSelections, modelConfig),
    [slotSelections, modelConfig],
  );
  const selectedPresetForActiveSlot = useMemo(() => {
    const selected = resolveGroupedPreset(activePhysicalSlots, safeSlotSelections);
    if (selected) return selected;
    return resolvePresetForSlot(
      resolvedActiveSlot,
      safeSlotSelections,
      preset,
      modelConfig.slotTokens,
    );
  }, [activePhysicalSlots, safeSlotSelections, resolvedActiveSlot, preset, modelConfig.slotTokens]);

  function applyPreset(id: MaterialPresetId) {
    for (const slot of activePhysicalSlots) setSlotPreset(slot, id);
    setPreset(id);
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-0 overflow-hidden", className)}>
      <div className="space-y-3 px-5 pt-4">
        {kindSlotIds.length > 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="font-display text-[12px] italic leading-none text-foreground/95">
                {kind === "gem" ? "Gem slots" : "Metal slots"}
              </h4>
              <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                Target
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {kindSlotIds.map((slot) => {
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
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex-1 overflow-y-auto px-5 pb-5">
        <div className="space-y-5">
          {groups.map((group, gi) => (
            <motion.section
              key={group.title}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.025, duration: 0.25 }}
              aria-label={group.title}
            >
              <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
                  {group.title}
                </h3>
                {group.tagline ? (
                  <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {group.tagline}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
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
