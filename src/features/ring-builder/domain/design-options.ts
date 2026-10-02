import {
  CENTRE_STONE_CUTS,
  CAD_GEMS,
  CAD_METALS,
  JEWELRY_PRESETS,
  type BandStones,
  type CadGemGroup,
  type CadMetalId,
  type HaloStyle,
  type HeadStyle,
  type ShankProfileId,
} from "@/lib/jewelry-cad";

/** Option lists and labels for the configurator. The CAD library owns the values. */

export type Option<T extends string> = { value: T; label: string; hint?: string };

export const STYLE_OPTIONS = JEWELRY_PRESETS.map((p) => ({ value: p.id, label: p.label, hint: p.description }));

export const CUT_OPTIONS = CENTRE_STONE_CUTS.map((c) => ({ value: c.id, label: c.label, family: c.family }));

/** Listed in this order: colourless, then fancy-colour diamonds, then coloured gems. */
const GEM_GROUP_LABELS: Record<CadGemGroup, string> = {
  colourless: "Colourless",
  fancy: "Fancy colour diamonds",
  coloured: "Coloured gems",
};
const GEM_GROUP_ORDER = Object.keys(GEM_GROUP_LABELS) as CadGemGroup[];

export const GEM_OPTIONS = [...CAD_GEMS]
  .sort((a, b) => GEM_GROUP_ORDER.indexOf(a.group) - GEM_GROUP_ORDER.indexOf(b.group))
  .map((g) => ({ value: g.id, label: g.label, presetId: g.material, group: GEM_GROUP_LABELS[g.group] }));

const OFFERED_METALS: CadMetalId[] = [
  "gold-14k-yellow",
  "gold-14k-white",
  "gold-14k-rose",
  "gold-18k-yellow",
  "gold-18k-white",
  "gold-18k-rose",
  "platinum",
  "silver-sterling",
];

export const METAL_OPTIONS = CAD_METALS.filter((m) => OFFERED_METALS.includes(m.id)).map((m) => ({
  value: m.id,
  label: m.shortLabel,
  full: m.label,
  presetId: m.id,
  // The swatch's stamp carries the fineness, so the name is the colour: "Yellow Gold", "Platinum".
  name: m.label.replace(/^\d+K\s+/, "").replace(/\s+\d+$/, ""),
}));

export const HEAD_OPTIONS: Option<HeadStyle>[] = [
  { value: "4-prong", label: "4-prong" },
  { value: "6-prong", label: "6-prong" },
  { value: "basket", label: "Basket" },
  { value: "bezel", label: "Bezel" },
];

export const HALO_OPTIONS: Option<HaloStyle>[] = [
  { value: "none", label: "None" },
  { value: "halo", label: "Halo" },
  { value: "hidden", label: "Hidden" },
];

export const BAND_ACCENT_OPTIONS: Option<BandStones>[] = [
  { value: "none", label: "Plain" },
  { value: "pave", label: "Pavé" },
  { value: "channel", label: "Channel" },
];

export const BAND_KIND_OPTIONS: Option<BandStones>[] = [
  { value: "none", label: "Plain" },
  { value: "eternity-half", label: "Half eternity" },
  { value: "eternity-full", label: "Full eternity" },
];

export const PROFILE_OPTIONS: Option<ShankProfileId>[] = [
  { value: "comfort", label: "Comfort" },
  { value: "d-shape", label: "D-shape" },
  { value: "flat", label: "Flat" },
  { value: "knife-edge", label: "Knife-edge" },
];

/** Carat weights a customer actually shops for; the slider snaps to these. */
export const CARAT_STEPS = [0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4, 5] as const;

export function nearestCaratStep(carat: number): number {
  let best = 0;
  CARAT_STEPS.forEach((c, i) => {
    if (Math.abs(c - carat) < Math.abs(CARAT_STEPS[best]! - carat)) best = i;
  });
  return best;
}
