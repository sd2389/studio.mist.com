"use client";

import { useMemo } from "react";
import { isCatalogMaterialRef } from "@/lib/catalog/catalog-material-ref";
import {
  isCustomMaterialRef,
  type SlotMaterialRef,
} from "@/lib/library/custom-material-ref";
import {
  isGemSlot,
  resolvePresetForSlot,
  sanitizeSlotSelections,
} from "@/lib/slot-materials/material-rules";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import {
  useMaterialPresetStore,
  type FinishId,
  type MaterialPresetId,
} from "@/stores/material-preset-store";

function isGenericGemToken(token: string): boolean {
  return /^(gem|stone|diamond)(\s*0*[1-9]\d*)?$/i.test(token.trim());
}

function resolveGroupedPreset(
  slots: string[],
  selections: Record<string, SlotMaterialRef>,
): SlotMaterialRef | undefined {
  for (const slot of slots) {
    const selected = selections[slot];
    if (selected) return selected;
  }
  return undefined;
}

type UseEditorSlotContextArgs = {
  activeSlot: string | null;
  modelConfig: PersistedModelConfig;
};

export function useEditorSlotContext({ activeSlot, modelConfig }: UseEditorSlotContextArgs) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);
  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const setFinish = useMaterialPresetStore((s) => s.setFinish);

  const collapseGemSlots = useMemo(() => {
    const gemSlots = modelConfig.slots.filter((slot) => slot.kind === "gem" || slot.kind === "accent");
    if (gemSlots.length <= 1) return false;
    const tokensBySlot = modelConfig.slotTokens ?? {};
    const hasAnyTokens = gemSlots.some((slot) => (tokensBySlot[slot.slotId] ?? []).length > 0);
    if (!hasAnyTokens) return false;
    return gemSlots.every((slot) =>
      (tokensBySlot[slot.slotId] ?? []).every((token) => isGenericGemToken(token)),
    );
  }, [modelConfig.slots, modelConfig.slotTokens]);

  const slotAliasMap = useMemo<Record<string, string[]>>(() => {
    const configured = modelConfig.slots.map((slot) => slot.slotId);
    const fromSelections = Object.keys(slotSelections);
    const merged = Array.from(new Set([...configured, ...fromSelections]));
    const physicalSlots = merged.length ? merged : ["Metal 1"];
    const logicalMap = Object.fromEntries(physicalSlots.map((slot) => [slot, [slot]])) as Record<
      string,
      string[]
    >;

    if (collapseGemSlots) {
      const gemSlots = physicalSlots.filter((slot) => slot.startsWith("Gem") || slot.startsWith("Accent"));
      if (gemSlots.length > 1) {
        const primaryGemSlot = gemSlots.includes("Gem 1") ? "Gem 1" : [...gemSlots].sort()[0];
        logicalMap[primaryGemSlot] = gemSlots;
        for (const slot of gemSlots) {
          if (slot !== primaryGemSlot) delete logicalMap[slot];
        }
      }
    }
    return logicalMap;
  }, [collapseGemSlots, modelConfig.slots, slotSelections]);

  const slotIds = useMemo(() => Object.keys(slotAliasMap), [slotAliasMap]);
  const resolvedActiveSlot = activeSlot && slotIds.includes(activeSlot) ? activeSlot : (slotIds[0] ?? null);
  const activePhysicalSlots = useMemo(
    () => (resolvedActiveSlot ? (slotAliasMap[resolvedActiveSlot] ?? [resolvedActiveSlot]) : []),
    [resolvedActiveSlot, slotAliasMap],
  );

  const safeSlotSelections = useMemo(
    () => sanitizeSlotSelections(slotSelections, modelConfig),
    [slotSelections, modelConfig],
  );

  const selectedPresetForActiveSlot = useMemo(() => {
    if (!resolvedActiveSlot) return preset;
    const selected = resolveGroupedPreset(activePhysicalSlots, safeSlotSelections);
    if (selected) return selected;
    return resolvePresetForSlot(
      resolvedActiveSlot,
      safeSlotSelections,
      preset,
      modelConfig.slotTokens,
    );
  }, [
    activePhysicalSlots,
    modelConfig.slotTokens,
    preset,
    resolvedActiveSlot,
    safeSlotSelections,
  ]);

  const activeSlotIsGem = resolvedActiveSlot ? isGemSlot(resolvedActiveSlot) : false;
  const activeSlotIsMetal = resolvedActiveSlot ? !activeSlotIsGem : false;

  const applyPresetToActiveSlots = (nextPreset: SlotMaterialRef, finish?: FinishId) => {
    if (!resolvedActiveSlot || activePhysicalSlots.length === 0) return;
    for (const slot of activePhysicalSlots) {
      setSlotPreset(slot, nextPreset);
    }
    if (!isCustomMaterialRef(nextPreset) && !isCatalogMaterialRef(nextPreset)) {
      setPreset(nextPreset);
    }
    if (finish) setFinish(finish);
  };

  return {
    resolvedActiveSlot,
    activePhysicalSlots,
    selectedPresetForActiveSlot,
    activeSlotIsGem,
    activeSlotIsMetal,
    applyPresetToActiveSlots,
  };
}
