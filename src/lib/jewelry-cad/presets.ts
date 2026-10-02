import type { JewelryDesign } from "@/lib/jewelry-cad/types";

/**
 * Starting points for the designer and the pieces shown in the gallery. A preset is only
 * data; the customer can change every option afterwards.
 */

export type PresetId =
  | "solitaire"
  | "halo"
  | "pave"
  | "three-stone"
  | "eternity"
  | "bezel"
  | "band"
  | "studs"
  | "pendant";

export type JewelryPreset = {
  id: PresetId;
  label: string;
  description: string;
  design: JewelryDesign;
};

const BASE: JewelryDesign = {
  kind: "ring",
  centerStone: true,
  sideStones: false,
  bandStones: "none",
  cut: "round",
  carat: 1,
  gem: "diamond",
  accentGem: "diamond",
  metal: "platinum",
  headMetal: "match",
  head: "6-prong",
  halo: "none",
  profile: "comfort",
  bandWidth: 2.2,
  bandThickness: 1.7,
  taper: 0.25,
  cathedral: false,
  ringSize: 6,
};

function preset(id: PresetId, label: string, description: string, design: Partial<JewelryDesign>): JewelryPreset {
  return { id, label, description, design: { ...BASE, ...design } };
}

export const JEWELRY_PRESETS: readonly JewelryPreset[] = [
  preset("solitaire", "Solitaire", "Six-prong round brilliant on a tapered comfort band.", {}),
  preset("halo", "Halo", "Center stone framed by a bead-set halo of melee.", {
    head: "4-prong",
    halo: "halo",
    metal: "gold-18k-white",
    taper: 0.15,
  }),
  preset("pave", "Pavé", "Basket solitaire on a band set with auto-fitted pavé.", {
    head: "basket",
    bandStones: "pave",
    metal: "gold-18k-yellow",
    headMetal: "gold-18k-white",
    carat: 1.25,
    cut: "oval",
    taper: 0.1,
  }),
  preset("three-stone", "Three-Stone", "Center stone flanked by two side stones in baskets.", {
    sideStones: true,
    head: "basket",
    metal: "platinum",
    bandWidth: 2.5,
    taper: 0,
  }),
  preset("eternity", "Eternity", "Shared-prong round brilliants all the way around.", {
    centerStone: false,
    bandStones: "eternity-full",
    bandWidth: 2.6,
    bandThickness: 1.8,
    profile: "flat",
    taper: 0,
    metal: "gold-18k-white",
  }),
  preset("bezel", "Bezel", "Emerald cut in a clean bezel on a knife-edge band.", {
    cut: "emerald",
    carat: 1.5,
    head: "bezel",
    profile: "knife-edge",
    metal: "gold-18k-yellow",
    bandWidth: 2.4,
    taper: 0.1,
  }),
  preset("band", "Band", "Plain comfort-fit wedding band.", {
    centerStone: false,
    bandWidth: 4,
    bandThickness: 1.8,
    taper: 0,
    metal: "gold-18k-yellow",
  }),
  preset("studs", "Studs", "Basket-set stud earrings on 0.8 mm posts.", {
    kind: "studs",
    head: "4-prong",
    carat: 0.5,
    metal: "gold-14k-white",
  }),
  preset("pendant", "Pendant", "Halo pendant with a forward-facing bail.", {
    kind: "pendant",
    head: "4-prong",
    halo: "halo",
    carat: 0.75,
    metal: "gold-18k-rose",
  }),
];

export const PRESET_IDS = JEWELRY_PRESETS.map((p) => p.id);

export function getPreset(id: string | null | undefined): JewelryPreset {
  return JEWELRY_PRESETS.find((p) => p.id === id) ?? JEWELRY_PRESETS[0]!;
}

export function isPresetId(id: string): id is PresetId {
  return JEWELRY_PRESETS.some((p) => p.id === id);
}
