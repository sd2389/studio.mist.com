import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { isCatalogMaterialRef } from "@/lib/catalog/catalog-material-ref";
import { isCustomMaterialRef, type SlotMaterialRef } from "@/lib/library/custom-material-ref";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { MaterialPresetId } from "@/stores/material-preset-store";

export type ShopperMaterialKind = "metal" | "gem";
export type ShopperMaterialOption = { id: MaterialPresetId; label: string };

const FALLBACK_SLOTS: Record<ShopperMaterialKind, readonly string[]> = {
  metal: ["Metal 1"],
  gem: ["Gem 1"],
};

export const SHOPPER_FALLBACK_LIMIT = 4;

export const SHOPPER_FALLBACK_METALS: readonly ShopperMaterialOption[] = [
  { id: "gold-14k-yellow", label: "14K Yellow" },
  { id: "gold-18k-white", label: "18K White" },
  { id: "gold-18k-rose", label: "18K Rose" },
  { id: "platinum", label: "Platinum" },
];

export const SHOPPER_FALLBACK_GEMS: readonly ShopperMaterialOption[] = [
  { id: "diamond", label: "Diamond" },
  { id: "ruby", label: "Ruby" },
  { id: "sapphire", label: "Sapphire" },
  { id: "emerald", label: "Emerald" },
];

export function shopperSlotsForKind(
  modelConfig: PersistedModelConfig,
  kind: ShopperMaterialKind,
): string[] {
  const fromConfig = modelConfig.slots
    .filter((slot) => matchesShopperKind(slot.kind, kind))
    .map((slot) => slot.slotId);
  return fromConfig.length > 0 ? fromConfig : [...FALLBACK_SLOTS[kind]];
}

/** Prefer the uploaded CAD's slot options; empty CAD gets at most 4 closer picks. */
export function shopperMaterialOptions(
  modelConfig: PersistedModelConfig,
  kind: ShopperMaterialKind,
  catalogFallback: readonly ShopperMaterialOption[] = shopperFallbackOptions(kind),
): ShopperMaterialOption[] {
  const seen = new Map<string, ShopperMaterialOption>();
  for (const slot of modelConfig.slots) {
    if (!matchesShopperKind(slot.kind, kind)) continue;
    const options =
      slot.materialOptions.length > 0
        ? slot.materialOptions
        : (modelConfig.materialOptionsBySlot[slot.slotId] ?? []);
    for (const option of options) {
      if (seen.has(option.id)) continue;
      seen.set(option.id, { id: option.id, label: option.label });
    }
  }
  if (seen.size > 0) return [...seen.values()];
  return catalogFallback.slice(0, SHOPPER_FALLBACK_LIMIT);
}

export function shopperFallbackOptions(
  kind: ShopperMaterialKind,
): readonly ShopperMaterialOption[] {
  return kind === "gem" ? SHOPPER_FALLBACK_GEMS : SHOPPER_FALLBACK_METALS;
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
