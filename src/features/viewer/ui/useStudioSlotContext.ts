"use client";

import { useMemo } from "react";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { resolvePresetForSlot, sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { resolveGroupedPreset, type SlotId } from "@/features/viewer/ui/studio-material-groups";
import {
  buildSlotAliasMap,
  filterSlotsByKind,
  shouldCollapseGemSlots,
} from "@/features/viewer/ui/studio-selection-utils";

type UseStudioSlotContextOptions = {
  modelConfig: PersistedModelConfig;
  activeSlot: SlotId;
  /** When set, `slotIds` / resolved active slot are filtered to that kind. */
  kind?: "metal" | "gem";
};

export function useStudioSlotContext({
  modelConfig,
  activeSlot,
  kind,
}: UseStudioSlotContextOptions) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);

  const collapseGemSlots = useMemo(() => shouldCollapseGemSlots(modelConfig), [modelConfig]);
  const slotAliasMap = useMemo(
    () => buildSlotAliasMap(modelConfig, slotSelections, collapseGemSlots),
    [modelConfig, slotSelections, collapseGemSlots],
  );
  const allSlotIds = useMemo(() => Object.keys(slotAliasMap), [slotAliasMap]);
  const slotIds = useMemo(
    () => (kind ? filterSlotsByKind(allSlotIds, kind) : allSlotIds),
    [allSlotIds, kind],
  );
  const defaultSlot = slotIds[0] ?? (kind === "gem" ? "Gem 1" : "Metal 1");
  const resolvedActiveSlot = slotIds.includes(activeSlot) ? activeSlot : defaultSlot;
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

  return {
    preset,
    slotSelections,
    slotAliasMap,
    /** All logical slots (unfiltered). Useful when `kind` filters `slotIds`. */
    allSlotIds,
    slotIds,
    resolvedActiveSlot,
    activePhysicalSlots,
    safeSlotSelections,
    selectedPresetForActiveSlot,
  };
}
