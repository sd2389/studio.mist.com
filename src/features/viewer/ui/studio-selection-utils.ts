import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { isCustomMaterialRef, parseCustomMaterialId } from "@/lib/library/custom-material-ref";
import { getPresetSwatchColor, isTransmissive } from "@/lib/material-swatch";
import { userMaterialPreviewColor } from "@/features/editor/ui/UserMaterialGrid";
import { useUserLibraryStore } from "@/stores/user-library-store";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { isGenericGemToken, slotKind, type SlotId } from "@/features/viewer/ui/studio-material-groups";

export function resolveSelectionSwatchColor(ref: SlotMaterialRef): string {
  if (isCustomMaterialRef(ref)) {
    const id = parseCustomMaterialId(ref);
    const item = id ? useUserLibraryStore.getState().getMaterial(id) : undefined;
    return item ? userMaterialPreviewColor(item) : "#9CA3AF";
  }
  return getPresetSwatchColor(ref);
}

export function resolveSelectionIsGem(ref: SlotMaterialRef): boolean {
  if (isCustomMaterialRef(ref)) {
    const id = parseCustomMaterialId(ref);
    const item = id ? useUserLibraryStore.getState().getMaterial(id) : undefined;
    return item?.kind === "gem";
  }
  return isTransmissive(ref);
}

export function shouldCollapseGemSlots(modelConfig: PersistedModelConfig): boolean {
  const gemSlots = modelConfig.slots.filter((slot) => slot.kind === "gem" || slot.kind === "accent");
  if (gemSlots.length <= 1) return false;
  const tokensBySlot = modelConfig.slotTokens ?? {};
  const hasAnyTokens = gemSlots.some((slot) => (tokensBySlot[slot.slotId] ?? []).length > 0);
  if (!hasAnyTokens) return false;
  return gemSlots.every((slot) => (tokensBySlot[slot.slotId] ?? []).every((token) => isGenericGemToken(token)));
}

export function buildSlotAliasMap(
  modelConfig: PersistedModelConfig,
  slotSelections: Record<string, SlotMaterialRef>,
  collapseGemSlots: boolean,
): Record<string, string[]> {
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
}

export function filterSlotsByKind(
  slotIds: string[],
  kind: "metal" | "gem",
): SlotId[] {
  return slotIds.filter((slot) => slotKind(slot) === kind);
}
