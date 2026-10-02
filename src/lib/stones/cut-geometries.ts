import { getCadCut, type CadCutId } from "@/lib/stones/cad-cuts";

export type CutId = CadCutId;

export type CutGroupId = "brilliant" | "step" | "side" | "antique";

export type CutInfo = {
  id: CutId;
  label: string;
  description: string;
  group: CutGroupId;
};

export const CUT_GROUPS: readonly { id: CutGroupId; label: string }[] = [
  { id: "brilliant", label: "Brilliant cuts" },
  { id: "step", label: "Step cuts" },
  { id: "side", label: "Side stones" },
  { id: "antique", label: "Antique cuts" },
];

type CatalogEntry = { group: CutGroupId; description: string; label?: string };

/**
 * Catalog copy for the stone pages. Geometry for every cut comes from the generated CAD
 * library (`cad-cuts.ts`, loaded by `load-cut-geometry.ts`); this adds grouping and text.
 */
const CATALOG: Record<CutId, CatalogEntry> = {
  round: {
    group: "brilliant",
    label: "Round Brilliant",
    description:
      "57 facets at the angles Tolkowsky set in 1919: 34.5° crown, 40.75° pavilion.",
  },
  oval: {
    group: "brilliant",
    description: "Elongated brilliant, 1.40 long to wide. Eight bezels, eight mains.",
  },
  cushion: {
    group: "brilliant",
    description: "Rounded square brilliant. Vintage warmth.",
  },
  pear: {
    group: "brilliant",
    description: "Teardrop. Half oval, half marquise.",
  },
  marquise: {
    group: "brilliant",
    description: "Pointed oval. Maximum carat-per-surface.",
  },
  heart: {
    group: "brilliant",
    description: "Two lobes, a cleft and a point. 57 facets, the halves mirrored.",
  },
  princess: {
    group: "brilliant",
    description: "Square, pointed corners. Its chevron pavilion draws the cross face-up.",
  },
  radiant: {
    group: "brilliant",
    description:
      "Cut-corner rectangle: a stepped crown over a chevron pavilion.",
  },
  trillion: {
    group: "brilliant",
    description: "Curved triangle brilliant. Bold spread for its weight.",
  },
  emerald: {
    group: "step",
    description: "Cut-corner rectangle in steps, three above and three below.",
  },
  asscher: {
    group: "step",
    description: "Square step cut with deep corners. Concentric squares face-up.",
  },
  octagon: {
    group: "step",
    description: "Eight equal sides in steps. Architectural calm.",
  },
  hexagon: {
    group: "step",
    description: "Six-sided step cut. Modern geometry.",
  },
  kite: {
    group: "step",
    description: "Four-sided step cut. A geometric accent or statement.",
  },
  shield: {
    group: "step",
    description: "Five-sided step cut. Deco side stone or bold centre.",
  },
  baguette: {
    group: "side",
    description:
      "Long rectangular step cut. Clean lines beside a centre stone.",
  },
  "tapered-baguette": {
    group: "side",
    description: "Trapezoid step cut. Tapers toward the centre stone.",
  },
  "half-moon": {
    group: "side",
    description: "Half-round step cut. Set in pairs to frame a centre.",
  },
  "old-european": {
    group: "antique",
    description:
      "Pre-1930 round: small table, crown over 40°, short lower halves, open culet.",
  },
  "old-mine": {
    group: "antique",
    description:
      "Squarish antique cushion: small table, high crown, open culet.",
  },
  rose: {
    group: "antique",
    description:
      "Dutch rose: 24 facets in a dome over a flat base, half as tall as wide.",
  },
  briolette: {
    group: "antique",
    description:
      "Faceted teardrop, no table or culet. Made to hang and catch light.",
  },
};

export const STANDARD_CUTS: readonly CutInfo[] = (
  Object.keys(CATALOG) as CutId[]
).map((id) => {
  const entry = CATALOG[id];
  return {
    id,
    label: entry.label ?? getCadCut(id).label,
    description: entry.description,
    group: entry.group,
  };
});

export function getCutById(id: string): CutInfo | null {
  return STANDARD_CUTS.find((c) => c.id === id) ?? null;
}
