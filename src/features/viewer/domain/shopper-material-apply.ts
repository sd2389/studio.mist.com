import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { isCatalogMaterialRef } from "@/lib/catalog/catalog-material-ref";
import { isCustomMaterialRef, type SlotMaterialRef } from "@/lib/library/custom-material-ref";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { MaterialPresetId } from "@/stores/material-preset-store";

export type ShopperMaterialKind = "metal" | "gem";

const FALLBACK_SLOTS: Record<ShopperMaterialKind, readonly string[]> = {
  metal: ["Metal 1"],
  gem: ["Gem 1"],
};

export function shopperSlotsForKind(
  modelConfig: PersistedModelConfig,
  kind: ShopperMaterialKind,
): string[] {
  const fromConfig = modelConfig.slots
    .filter((slot) => matchesShopperKind(slot.kind, kind))
    .map((slot) => slot.slotId);
  return fromConfig.length > 0 ? fromConfig : [...FALLBACK_SLOTS[kind]];
}

export function applyShopperMaterial(args: {
  kind: ShopperMaterialKind;
  preset: MaterialPresetId;
  modelConfig: PersistedModelConfig;
  setSlotPreset: (slot: string, preset: MaterialPresetId) => void;
  setPreset: (preset: MaterialPresetId) => void;
}): void {
  const slots = shopperSlotsForKind(args.modelConfig, args.kind);
  for (const slot of slots) {
    args.setSlotPreset(slot, args.preset);
  }
  args.setPreset(args.preset);
}

export function selectedShopperPreset(
  kind: ShopperMaterialKind,
  slots: string[],
  slotSelections: Record<string, SlotMaterialRef>,
  fallbackPreset: MaterialPresetId,
): MaterialPresetId | undefined {
  for (const slot of slots) {
    const selected = slotSelections[slot];
    if (selected && isPresetMaterialId(selected)) return selected;
  }
  if (fallbackPreset === "original") return undefined;
  const fallbackKind: ShopperMaterialKind = isGemPresetId(fallbackPreset)
    ? "gem"
    : "metal";
  return fallbackKind === kind ? fallbackPreset : undefined;
}

function matchesShopperKind(
  slotKind: PersistedModelConfig["slots"][number]["kind"],
  kind: ShopperMaterialKind,
): boolean {
  if (kind === "metal") return slotKind === "metal";
  return slotKind === "gem" || slotKind === "accent";
}

function isPresetMaterialId(value: SlotMaterialRef): value is MaterialPresetId {
  return !isCustomMaterialRef(value) && !isCatalogMaterialRef(value);
}
