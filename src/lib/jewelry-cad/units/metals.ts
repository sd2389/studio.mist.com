/**
 * Casting metals offered by the designer, with alloy densities for weight estimates.
 * Ids match the studio's metal material presets so a design can be rendered directly.
 */

export type CadMetalId =
  | "gold-14k-yellow"
  | "gold-14k-white"
  | "gold-14k-rose"
  | "gold-18k-yellow"
  | "gold-18k-white"
  | "gold-18k-rose"
  | "platinum"
  | "silver-sterling"
  | "gold-24k";

export type CadMetal = {
  id: CadMetalId;
  label: string;
  shortLabel: string;
  /** Density in g/cm³. */
  density: number;
  /** Swatch colour for UI chips. */
};

export const CAD_METALS: readonly CadMetal[] = [
  { id: "gold-14k-yellow", label: "14K Yellow Gold", shortLabel: "14K Yellow", density: 13.1 },
  { id: "gold-14k-white", label: "14K White Gold", shortLabel: "14K White", density: 13.4 },
  // Rose golds swap silver for copper; ~0.1–0.3 g/cm³ lighter than yellow at the same karat.
  { id: "gold-14k-rose", label: "14K Rose Gold", shortLabel: "14K Rose", density: 13.0 },
  { id: "gold-18k-yellow", label: "18K Yellow Gold", shortLabel: "18K Yellow", density: 15.5 },
  { id: "gold-18k-white", label: "18K White Gold", shortLabel: "18K White", density: 15.9 },
  { id: "gold-18k-rose", label: "18K Rose Gold", shortLabel: "18K Rose", density: 15.2 },
  { id: "platinum", label: "Platinum 950", shortLabel: "Platinum", density: 20.7 },
  { id: "silver-sterling", label: "Sterling Silver", shortLabel: "Sterling", density: 10.36 },
  { id: "gold-24k", label: "24K Gold", shortLabel: "24K", density: 19.3 },
];

export function getCadMetal(id: CadMetalId): CadMetal {
  const metal = CAD_METALS.find((m) => m.id === id);
  if (!metal) throw new Error(`Unknown metal: ${id}`);
  return metal;
}

export function isCadMetalId(id: string): id is CadMetalId {
  return CAD_METALS.some((m) => m.id === id);
}

/** Grams of metal for a volume in mm³ (1 cm³ = 1000 mm³). */
export function metalWeightGrams(volumeMm3: number, metal: CadMetalId): number {
  return (volumeMm3 / 1000) * getCadMetal(metal).density;
}
