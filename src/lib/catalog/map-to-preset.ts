import { catalogMaterialRef, type CatalogMaterialRef } from "@/lib/catalog/catalog-material-ref";
import { GEM_PRESET_IDS, isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import type { FinishId, MaterialPresetId } from "@/stores/material-preset-store";
import type { GemItem, MetalItem } from "./types";

const METAL_PRESET_IDS = new Set<MaterialPresetId>([
  "gold-24k",
  "gold-22k",
  "gold-18k-yellow",
  "gold-14k-yellow",
  "gold-10k-yellow",
  "gold-9k-yellow",
  "gold-18k-white",
  "gold-14k-white",
  "gold-10k-white",
  "platinum",
  "silver-sterling",
  "titanium",
  "rhodium-black",
  "gold-18k-rose",
  "gold-14k-rose",
  "gold-red",
  "gold-red-light",
  "gold-green",
  "gold-grey",
  "gold-sand",
  "gold-warm",
]);

const FINISH_SUFFIXES: FinishId[] = ["polished", "brushed", "satin", "hammered", "sandblasted"];

function isMetalPresetId(id: string): id is MaterialPresetId {
  return METAL_PRESET_IDS.has(id as MaterialPresetId);
}

function parseFinishFromSlug(slug: string): FinishId {
  for (const finish of FINISH_SUFFIXES) {
    if (slug.endsWith(`-${finish}`)) return finish;
  }
  return "polished";
}

function parseBaseSlugFromMetalSlug(slug: string): string {
  for (const finish of FINISH_SUFFIXES) {
    const suffix = `-${finish}`;
    if (slug.endsWith(suffix)) return slug.slice(0, -suffix.length);
  }
  return slug;
}

export type CatalogMetalApply = {
  preset: MaterialPresetId | CatalogMaterialRef;
  finish: FinishId;
};

/** Map a Phase 1 catalog metal row to renderer preset + finish. */
export function mapCatalogMetalToApply(item: MetalItem): CatalogMetalApply {
  const params = item.params;
  const baseSlug =
    typeof params.baseSlug === "string" ? params.baseSlug : parseBaseSlugFromMetalSlug(item.slug);
  const finish =
    typeof params.finish === "string" && FINISH_SUFFIXES.includes(params.finish as FinishId)
      ? (params.finish as FinishId)
      : parseFinishFromSlug(item.slug);

  if (item.category === "metal" && isMetalPresetId(baseSlug)) {
    return { preset: baseSlug, finish };
  }

  if (item.category === "surface") {
    return { preset: catalogMaterialRef(item.slug), finish };
  }

  return { preset: catalogMaterialRef(item.slug), finish };
}

const GEM_SLUG_RULES: Array<[RegExp, MaterialPresetId]> = [
  [/^diamond-black/, "diamond-black"],
  [/^diamond-canary/, "diamond-canary"],
  [/^diamond-pink/, "diamond-pink"],
  [/^diamond-blue/, "diamond-blue"],
  [/^diamond-cognac/, "diamond-cognac"],
  [/^diamond-champagne/, "diamond-champagne"],
  [/^diamond-green/, "diamond"],
  [/^diamond/, "diamond"],
  [/^moissanite/, "moissanite"],
  [/^ruby/, "ruby"],
  [/^sapphire/, "sapphire"],
  [/^spinel/, "spinel"],
  [/^tanzanite/, "tanzanite"],
  [/^garnet-tsavorite/, "garnet-tsavorite"],
  [/^garnet-almandine/, "garnet-almandine"],
  [/^garnet/, "garnet-almandine"],
  [/^peridot/, "peridot"],
  [/^topaz/, "topaz-blue"],
  [/^tourmaline/, "tourmaline"],
  [/^aquamarine/, "aquamarine"],
  [/^emerald/, "emerald"],
  [/^morganite/, "morganite"],
  [/^amethyst/, "amethyst"],
  [/^citrine/, "citrine"],
  [/^zircon/, "zircon"],
  [/^opal/, "opal"],
  [/^jade/, "jade"],
  [/^pearl/, "pearl"],
];

/** Map a Phase 1 catalog gem row to the closest renderer gem preset. */
export function mapCatalogGemToPreset(item: GemItem): MaterialPresetId {
  const slug = item.slug;
  if (isGemPresetId(slug)) return slug;
  if ((GEM_PRESET_IDS as string[]).includes(slug)) return slug as MaterialPresetId;

  for (const [pattern, preset] of GEM_SLUG_RULES) {
    if (pattern.test(slug)) return preset;
  }
  return "diamond";
}
