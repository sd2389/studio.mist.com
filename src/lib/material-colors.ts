import { GEM_CONFIGS, isGemPresetId, type GemConfig } from "@/lib/gem-gpu/gem-configs";

/**
 * The one colour table for material swatches. Metals are listed here; gems take theirs from
 * GEM_CONFIGS. Pure data, so the CAD worker and its exports share it with the studio UI.
 */
const METAL_SWATCH: Record<string, string> = {
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
};

/** Visible-on-chip colour (sRGB hex) for a studio preset id, if it has one. */
export function presetSwatchHex(id: string): string | undefined {
  return isGemPresetId(id) ? GEM_CONFIGS[id].baseColor : METAL_SWATCH[id];
}

/** What a swatch draws: a cut gem, a cabochon (pearl, opal, jade) or a metal band. */
export type SwatchShape = "faceted" | "cabochon" | "metal";

export function presetSwatchShape(id: string): SwatchShape {
  if (!isGemPresetId(id)) return "metal";
  const config: GemConfig = GEM_CONFIGS[id];
  return (config.transmission ?? 1) >= 0.9 || id.includes("diamond") ? "faceted" : "cabochon";
}

/** Fineness stamp: 14K/18K/24K for golds, PT platinum, 925 sterling, Ti titanium. */
export function metalBadge(id: string): string | undefined {
  const karat = /gold-(\d+)k/.exec(id);
  if (karat) return `${karat[1]}K`;
  if (id.startsWith("platinum")) return "PT";
  if (id.startsWith("silver")) return "925";
  if (id === "titanium") return "Ti";
  return undefined;
}
