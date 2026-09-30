import * as THREE from "three";
import { buildBrilliantCut, IDEAL_ROUND_BRILLIANT, ROUND_OUTLINE } from "@/lib/stones/brilliant-cut";

export type CutId =
  | "round"
  | "princess"
  | "emerald"
  | "asscher"
  | "marquise"
  | "oval"
  | "pear"
  | "cushion";

export type CutInfo = {
  id: CutId;
  label: string;
  description: string;
};

/** Round brilliant — true 57-facet topology (table, stars, kites, girdle halves, mains). */
function roundBrilliant(): THREE.BufferGeometry {
  return buildBrilliantCut(ROUND_OUTLINE, IDEAL_ROUND_BRILLIANT);
}

/**
 * Catalog metadata for the stone pages. Actual gem geometry for every cut here comes from
 * the CAD library (see `load-cut-geometry.ts`); this only supplies id/label/description
 * for routing and display.
 */
export const STANDARD_CUTS: readonly CutInfo[] = [
  {
    id: "round",
    label: "Round Brilliant",
    description: "57-facet ideal cut. Maximum optical fire.",
  },
  {
    id: "princess",
    label: "Princess",
    description: "Square brilliant. Sharp corners, fierce sparkle.",
  },
  {
    id: "emerald",
    label: "Emerald",
    description: "Rectangular step cut. Long flashes over fire.",
  },
  {
    id: "asscher",
    label: "Asscher",
    description: "Square step cut. Art-deco hall-of-mirrors.",
  },
  {
    id: "marquise",
    label: "Marquise",
    description: "Pointed oval. Maximum carat-per-surface.",
  },
  {
    id: "oval",
    label: "Oval",
    description: "Elongated brilliant. Soft outline, lots of fire.",
  },
  {
    id: "pear",
    label: "Pear",
    description: "Teardrop. Half oval, half marquise.",
  },
  {
    id: "cushion",
    label: "Cushion",
    description: "Rounded square brilliant. Vintage warmth.",
  },
];

export function getCutById(id: string): CutInfo | null {
  return STANDARD_CUTS.find((c) => c.id === id) ?? null;
}

/** Reusable diamond geometry for jewelry assemblies. */
export function diamondGeometry(scale = 1): THREE.BufferGeometry {
  const g = roundBrilliant();
  if (scale !== 1) g.scale(scale, scale, scale);
  return g;
}
