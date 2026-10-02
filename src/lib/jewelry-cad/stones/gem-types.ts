import type { GemPresetId } from "@/lib/gem-gpu/gem-configs";

/**
 * Stone materials the designer offers. `material` is the studio gem preset used to render
 * it; `sizingGravity` is the specific gravity used to turn carats into millimetres
 * (moissanite is sold by diamond-equivalent size, so it sizes like a diamond).
 */

export type CadGemId =
  | "diamond"
  | "lab-diamond"
  | "moissanite"
  | "sapphire"
  | "sapphire-pink"
  | "ruby"
  | "emerald"
  | "morganite"
  | "aquamarine"
  | "tanzanite"
  | "diamond-canary"
  | "diamond-pink"
  | "diamond-fancy-blue"
  | "diamond-fancy-green"
  | "diamond-fancy-orange"
  | "diamond-fancy-purple"
  | "diamond-fancy-red"
  | "diamond-champagne"
  | "diamond-cognac"
  | "diamond-fancy-grey"
  | "diamond-black";

/** How the designer groups stones: colourless, fancy-colour diamonds, coloured gems. */
export type CadGemGroup = "colourless" | "fancy" | "coloured";

export type CadGem = {
  id: CadGemId;
  label: string;
  group: CadGemGroup;
  material: GemPresetId;
  sizingGravity: number;
  /** Refractive index, for exported (non-studio) materials. */
  ior: number;
};

/** Fancy-colour diamonds share a diamond's optics and sizing. */
function fancyDiamonds(entries: [CadGemId, string, GemPresetId][]): CadGem[] {
  return entries.map(([id, label, material]) => ({
    id,
    label,
    group: "fancy",
    material,
    sizingGravity: 3.52,
    ior: 2.417,
  }));
}

export const CAD_GEMS: readonly CadGem[] = [
  { id: "diamond", label: "Natural diamond", group: "colourless", material: "diamond", sizingGravity: 3.52, ior: 2.417 },
  { id: "lab-diamond", label: "Lab-grown diamond", group: "colourless", material: "diamond", sizingGravity: 3.52, ior: 2.417 },
  { id: "moissanite", label: "Moissanite", group: "colourless", material: "moissanite", sizingGravity: 3.52, ior: 2.65 },
  { id: "sapphire", label: "Blue sapphire", group: "coloured", material: "sapphire", sizingGravity: 4.0, ior: 1.77 },
  { id: "sapphire-pink", label: "Pink sapphire", group: "coloured", material: "sapphire-pink", sizingGravity: 4.0, ior: 1.77 },
  { id: "ruby", label: "Ruby", group: "coloured", material: "ruby", sizingGravity: 4.0, ior: 1.77 },
  { id: "emerald", label: "Emerald", group: "coloured", material: "emerald", sizingGravity: 2.72, ior: 1.58 },
  { id: "morganite", label: "Morganite", group: "coloured", material: "morganite", sizingGravity: 2.8, ior: 1.59 },
  { id: "aquamarine", label: "Aquamarine", group: "coloured", material: "aquamarine", sizingGravity: 2.7, ior: 1.58 },
  { id: "tanzanite", label: "Tanzanite", group: "coloured", material: "tanzanite", sizingGravity: 3.35, ior: 1.69 },
  { id: "diamond-canary", label: "Canary diamond", group: "fancy", material: "diamond-canary", sizingGravity: 3.52, ior: 2.417 },
  { id: "diamond-pink", label: "Pink diamond", group: "fancy", material: "diamond-pink", sizingGravity: 3.52, ior: 2.417 },
  ...fancyDiamonds([
    // GIA grades red only as "Fancy Red"; champagne and cognac are the trade's light and deep browns.
    ["diamond-fancy-blue", "Blue diamond", "diamond-fancy-blue-intense"],
    ["diamond-fancy-green", "Green diamond", "diamond-fancy-green-intense"],
    ["diamond-fancy-orange", "Orange diamond", "diamond-fancy-orange-vivid"],
    ["diamond-fancy-purple", "Purple diamond", "diamond-fancy-purple-intense"],
    ["diamond-fancy-red", "Red diamond", "diamond-fancy-red-fancy"],
    ["diamond-champagne", "Champagne diamond", "diamond-fancy-brown-light"],
    ["diamond-cognac", "Cognac diamond", "diamond-fancy-brown-deep"],
    ["diamond-fancy-grey", "Grey diamond", "diamond-fancy-grey-fancy"],
    ["diamond-black", "Black diamond", "diamond-black"],
  ]),
];

export function getCadGem(id: CadGemId): CadGem {
  const gem = CAD_GEMS.find((g) => g.id === id);
  if (!gem) throw new Error(`Unknown gem: ${id}`);
  return gem;
}

export function isCadGemId(id: string): id is CadGemId {
  return CAD_GEMS.some((g) => g.id === id);
}
