import { isCatalogMaterialRef, parseCatalogMaterialSlug } from "@/lib/catalog/catalog-material-ref";
import { GEM_CONFIGS, isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import type { MaterialPresetId } from "@/stores/material-preset-store";

/** Visible-on-chip colour (sRGB hex) for core metal presets. Gems resolve via GEM_CONFIGS. */
const METAL_HEX: Partial<Record<MaterialPresetId, string>> = {
  "gold-24k": "#FFC940",
  "gold-22k": "#FFC658",
  "gold-18k-yellow": "#F5D785",
  "gold-18k-white": "#E8E4DC",
  "gold-18k-rose": "#E8B3A5",
  "gold-14k-yellow": "#EDD09A",
  "gold-14k-white": "#E4E2DC",
  "gold-14k-rose": "#DDB4A6",
  "gold-10k-yellow": "#E0C895",
  "gold-10k-white": "#DDDCD8",
  "gold-9k-yellow": "#DCBA80",
  platinum: "#D4D4D6",
  "silver-sterling": "#F1EFE7",
  titanium: "#8B847C",
  "rhodium-black": "#1F2024",
  "gold-red": "#C97746",
  "gold-red-light": "#D89478",
  "gold-green": "#D8D27D",
  "gold-grey": "#BFB6A6",
  "gold-sand": "#E9D9B8",
  "gold-warm": "#E6B860",
  diamond: "#FFFFFF",
  "diamond-canary": "#FFE066",
  "diamond-pink": "#FFB1C8",
  "diamond-blue": "#88BFE0",
  "diamond-champagne": "#E8C68A",
  "diamond-cognac": "#8E5A2B",
  "diamond-black": "#1a1a1a",
  moissanite: "#FFFFFF",
  zircon: "#FFFFFF",
  ruby: "#E0115F",
  sapphire: "#0F52BA",
  spinel: "#FF3F4E",
  tanzanite: "#4B3FA7",
  "garnet-tsavorite": "#1FAE5A",
  "garnet-almandine": "#7A1F2D",
  peridot: "#9FCC2D",
  "topaz-blue": "#88D8E0",
  tourmaline: "#FF49A0",
  aquamarine: "#7FE0E8",
  emerald: "#1ABC57",
  morganite: "#FFCBC4",
  amethyst: "#9966CC",
  citrine: "#E4C04A",
  opal: "#F5F0E6",
  jade: "#52B788",
  pearl: "#F8F1E6",
};

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
  if (isGemPresetId(id) && GEM_CONFIGS[id]) return GEM_CONFIGS[id].baseColor;
  return METAL_HEX[id] ?? "#9CA3AF";
}

/** Whether the preset is transmissive (gem-shaped chip) or opaque (metal-shaped chip). */
export function isTransmissive(id: MaterialPresetId | SlotMaterialRef): boolean {
  if (id === "original") return false;
  if (isCatalogMaterialRef(id)) {
    const slug = parseCatalogMaterialSlug(id);
    if (!slug) return false;
    return useCatalogParamsStore.getState().getGemParams(slug) !== null;
  }
  return isGemPresetId(id);
}
