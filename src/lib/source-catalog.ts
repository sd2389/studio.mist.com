import type { MaterialPresetId } from "@/stores/material-preset-store";

export type SourceCatalogItem = {
  _id: string;
  type: string;
  category: string;
  name: string;
  thumbnail?: string;
  value?: string;
  isActive?: boolean;
  weight?: number;
};

export type SourceCatalogPayload = {
  metals: SourceCatalogItem[];
  gems: SourceCatalogItem[];
  scenes: SourceCatalogItem[];
  counts: {
    metals: number;
    gems: number;
    scenes: number;
  };
};

export { resolveSourceAssetUrl } from "@/lib/public-asset-url";

const METAL_FALLBACK: MaterialPresetId = "gold-14k-yellow";
const GEM_FALLBACK: MaterialPresetId = "diamond";

/** Checked in order against the lower-cased "type name"; the first match wins. */
type PresetRule = [RegExp, MaterialPresetId];

const NAMED_METAL_RULES: PresetRule[] = [
  [/blackrhodium/, "rhodium-black"],
  [/platinum/, "platinum"],
  [/silver/, "silver-sterling"],
  [/titan/, "titanium"],
  [/warmgold/, "gold-warm"],
  [/sandgold/, "gold-sand"],
  [/greengold/, "gold-green"],
  [/greygold/, "gold-grey"],
  [/redgoldlight/, "gold-red-light"],
  [/redgold/, "gold-red"],
];

const WHITE_GOLD_RULES: PresetRule[] = [
  [/10k/, "gold-10k-white"],
  [/14k/, "gold-14k-white"],
];

const YELLOW_GOLD_RULES: PresetRule[] = [
  [/24k/, "gold-24k"],
  [/22k/, "gold-22k"],
  [/18k/, "gold-18k-yellow"],
  [/14k/, "gold-14k-yellow"],
  [/10k/, "gold-10k-yellow"],
  [/09k|9k/, "gold-9k-yellow"],
  [/gold/, "gold-14k-yellow"],
];

const DIAMOND_COLOR_RULES: PresetRule[] = [
  [/black/, "diamond-black"],
  [/blue/, "diamond-blue"],
  [/pink/, "diamond-pink"],
  [/cognac|brown/, "diamond-cognac"],
  [/champagne/, "diamond-champagne"],
  [/yellow|canary|k faintyellow|p verylightyellow|t lightyellow/, "diamond-canary"],
];

const GEM_RULES: PresetRule[] = [
  [/emerald/, "emerald"],
  [/ruby/, "ruby"],
  [/sapphire/, "sapphire"],
  [/zircon/, "zircon"],
  [/amethyst|amethist/, "amethyst"],
  [/aquamarin/, "aquamarine"],
  [/citrine/, "citrine"],
  [/morganit/, "morganite"],
  [/peridot/, "peridot"],
  [/topas|topaz/, "topaz-blue"],
  [/tourmalin/, "tourmaline"],
  [/tansanit|tanzanit/, "tanzanite"],
  [/tsavorit/, "garnet-tsavorite"],
  [/garnet/, "garnet-almandine"],
  [/spinel/, "spinel"],
  [/opal/, "opal"],
  [/jade/, "jade"],
  [/pearl/, "pearl"],
];

function matchPreset(token: string, rules: PresetRule[]): MaterialPresetId | null {
  for (const [pattern, preset] of rules) {
    if (pattern.test(token)) return preset;
  }
  return null;
}

export function mapSourceMetalToPreset(item: SourceCatalogItem): MaterialPresetId {
  const token = `${item.type} ${item.name}`.toLowerCase();

  const namedMetal = matchPreset(token, NAMED_METAL_RULES);
  if (namedMetal) return namedMetal;
  if (token.includes("rosegold")) return token.includes("14k") ? "gold-14k-rose" : "gold-18k-rose";
  if (token.includes("whitegold")) return matchPreset(token, WHITE_GOLD_RULES) ?? "gold-18k-white";

  return matchPreset(token, YELLOW_GOLD_RULES) ?? METAL_FALLBACK;
}

export function mapSourceGemToPreset(item: SourceCatalogItem): MaterialPresetId {
  const token = `${item.type} ${item.name}`.toLowerCase();

  if (token.includes("moissanite")) return "moissanite";
  if (token.includes("diamond")) return matchPreset(token, DIAMOND_COLOR_RULES) ?? "diamond";

  return matchPreset(token, GEM_RULES) ?? GEM_FALLBACK;
}

export async function fetchSourceCatalog(): Promise<SourceCatalogPayload> {
  const response = await fetch("/api/catalog/source", { cache: "no-store", credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to load source catalog");
  }
  return (await response.json()) as SourceCatalogPayload;
}

