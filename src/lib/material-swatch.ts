import { isCatalogMaterialRef, parseCatalogMaterialSlug } from "@/lib/catalog/catalog-material-ref";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { presetSwatchHex, presetSwatchShape, type SwatchShape } from "@/lib/material-colors";
import {
  isCustomMaterialRef,
  parseCustomMaterialId,
  type SlotMaterialRef,
} from "@/lib/library/custom-material-ref";
import type { UserMaterialItem } from "@/lib/library/types";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { useUserLibraryStore } from "@/stores/user-library-store";
import type { MaterialPresetId } from "@/stores/material-preset-store";

/** A `custom:<id>` reference's library material, once registered (`useUserLibraryStore`). */
function libraryMaterial(id: string): UserMaterialItem | undefined {
  const materialId = parseCustomMaterialId(id);
  return materialId === null ? undefined : useUserLibraryStore.getState().getMaterial(materialId);
}

export function getPresetSwatchColor(id: MaterialPresetId | SlotMaterialRef): string {
  if (id === "original") return "#52525B";
  if (isCatalogMaterialRef(id)) {
    const slug = parseCatalogMaterialSlug(id);
    if (!slug) return "#9CA3AF";
    const store = useCatalogParamsStore.getState();
    const gem = store.getGemParams(slug);
    if (gem && typeof gem.baseColor === "string") return gem.baseColor;
    const metal = store.getMetalParams(slug);
    if (metal && typeof metal.color === "string") return metal.color;
    return "#9CA3AF";
  }
  if (isCustomMaterialRef(id)) {
    const material = libraryMaterial(id);
    const color = material?.kind === "gem" ? material.params.baseColor : material?.params.color;
    return typeof color === "string" ? color : "#9CA3AF";
  }
  return presetSwatchHex(id) ?? "#9CA3AF";
}

/** Whether the preset is transmissive (gem-shaped chip) or opaque (metal-shaped chip). */
export function isTransmissive(id: MaterialPresetId | SlotMaterialRef): boolean {
  if (id === "original") return false;
  if (isCatalogMaterialRef(id)) {
    const slug = parseCatalogMaterialSlug(id);
    if (!slug) return false;
    return useCatalogParamsStore.getState().getGemParams(slug) !== null;
  }
  if (isCustomMaterialRef(id)) return libraryMaterial(id)?.kind === "gem";
  return isGemPresetId(id);
}

/** Swatch shape for a preset or a catalogue/custom material reference. */
export function swatchShape(id: MaterialPresetId | SlotMaterialRef): SwatchShape {
  if (isCatalogMaterialRef(id) || isCustomMaterialRef(id)) return isTransmissive(id) ? "faceted" : "metal";
  return presetSwatchShape(id);
}
