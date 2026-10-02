import type * as THREE from "three";
import {
  IDEAL_ROUND_BRILLIANT,
  type BrilliantProportions,
} from "@/lib/stones/brilliant-cut";
import {
  buildBrilliantSolid,
  type BrilliantSolidOptions,
} from "@/lib/stones/brilliant-solid";
import {
  cushionOutline,
  cutCornerOutline,
  halfMoonOutline,
  hexagonOutline,
  kiteOutline,
  marquiseOutline,
  octagonOutline,
  ovalOutline,
  pearOutline,
  roundOutline,
  shieldOutline,
  taperedBaguetteOutline,
  trillionOutline,
} from "@/lib/stones/outline-shapes";
import type { GirdleOutline } from "@/lib/stones/outlines";
import {
  ASSCHER_STEP_CUT,
  asscherOutline,
  buildStepCutSolid,
  EMERALD_STEP_CUT,
  emeraldOutline,
  type StepCutProportions,
} from "@/lib/stones/step-cut";
import { buildChevronCutSolid, PRINCESS_CUT, RADIANT_CUT } from "@/lib/stones/chevron-cut";
import { buildHeartCutSolid, heartOutline } from "@/lib/stones/heart-cut";
import {
  buildRoseCutSolid,
  type RoseCutProportions,
} from "@/lib/stones/rose-cut";
import {
  brioletteOutline,
  buildBrioletteSolid,
  type BrioletteProportions,
} from "@/lib/stones/briolette";

/**
 * Procedural cuts: every stone is built in code from its facet planes, with no third-party
 * mesh behind it, so it ships freely in downloads. The stone pages, the ring designer and
 * the CAD library all draw these.
 *
 * Geometry frame: girdle mid-plane at y = 0, table toward +y, length along x, width
 * along z, units of the caller (mm in `@/lib/jewelry-cad`).
 */

export type CadCutId =
  | "round"
  | "oval"
  | "cushion"
  | "pear"
  | "marquise"
  | "heart"
  | "princess"
  | "emerald"
  | "asscher"
  | "radiant"
  | "trillion"
  | "baguette"
  | "tapered-baguette"
  | "kite"
  | "shield"
  | "half-moon"
  | "hexagon"
  | "octagon"
  | "old-european"
  | "old-mine"
  | "rose"
  | "briolette";

export type CutFamily = "brilliant" | "step" | "mixed" | "antique";

export type CadCut = {
  id: CadCutId;
  label: string;
  family: CutFamily;
  /** Length:width of the cut's standard outline (1 for round and square shapes). */
  ratio: number;
  /**
   * Offered as a ring's centre stone. Side-stone shapes (half moon, tapered baguette), drops
   * (briolette) and the flat-backed rose are set in channels, bezels or bails instead.
   */
  centre: boolean;
  outline: (length: number, width: number) => GirdleOutline;
  build: (length: number, width: number) => THREE.BufferGeometry;
};

const ROUND: BrilliantProportions = { ...IDEAL_ROUND_BRILLIANT, table: 0.56 };
const FANCY: BrilliantProportions = {
  ...IDEAL_ROUND_BRILLIANT,
  table: 0.57,
  crownAngle: 34,
  pavilionAngle: 41,
};
const CUSHION: BrilliantProportions = {
  ...IDEAL_ROUND_BRILLIANT,
  table: 0.6,
  crownAngle: 35,
  pavilionAngle: 42.5,
  girdle: 0.035,
};
const TRILLION: BrilliantProportions = {
  ...IDEAL_ROUND_BRILLIANT,
  table: 0.6,
  crownAngle: 32,
  pavilionAngle: 42,
  girdle: 0.03,
};
/**
 * Pre-1930 round: small table, high crown, short lower halves and an open culet — GIA's
 * old-European test (table ≤ 53%, crown ≥ 40°, lower halves ≤ 60%, culet slightly large).
 */
const OLD_EUROPEAN: BrilliantProportions = {
  table: 0.42,
  crownAngle: 41,
  pavilionAngle: 42,
  girdle: 0.02,
  starLength: 0.42,
  starAngle: 26,
  lowerGirdleLength: 0.58,
  culet: 0.05,
};
/** The old mine is the same cutting on a squarish cushion, with a larger culet. */
const OLD_MINE: BrilliantProportions = {
  ...OLD_EUROPEAN,
  table: 0.4,
  pavilionAngle: 42.5,
  culet: 0.07,
};
/** Calibrated side-stone step cut: two crown steps, three pavilion steps. */
const SIDE_STEP_CUT: StepCutProportions = {
  table: 0.66,
  crownTiers: [40, 28],
  pavilionTiers: [50, 42, 34],
  girdle: 0.03,
};
/** Bauer (1904): height half the diameter, the star ring ¾ of it across at ⅗ of the height. */
const DUTCH_ROSE: RoseCutProportions = {
  height: 0.5,
  starRing: 0.75,
  starRingHeight: 0.6,
  girdle: 0.02,
};
const BRIOLETTE: BrioletteProportions = {
  sides: 10,
  rings: [0.12, 0.3, 0.5, 0.7, 0.88],
  shoulder: 0.3,
};

type OutlineFn = (l: number, w: number) => GirdleOutline;

function brilliant(
  outline: OutlineFn,
  proportions: BrilliantProportions,
  options: BrilliantSolidOptions = {},
) {
  return (l: number, w: number): THREE.BufferGeometry =>
    buildBrilliantSolid(outline(l, w), proportions, options);
}

function step(outline: OutlineFn, proportions: StepCutProportions) {
  return (l: number, w: number): THREE.BufferGeometry =>
    buildStepCutSolid(outline(l, w), proportions);
}

const roundOutlineLW = (l: number) => roundOutline(l);
const radiantOutline = (l: number, w: number) =>
  cutCornerOutline(l, w, Math.min(l, w) * RADIANT_CUT.corner);
const emeraldOutlineLW = (l: number, w: number) => emeraldOutline(l, w);
const asscherOutlineLW = (l: number) => asscherOutline(l);
// A centre-stone trillion's sides are bowed slightly outward; a straight one reads as a side stone.
const trillionCurved = (l: number, w: number) => trillionOutline(l, w, 0.05);
const rectangleOutline = (l: number, w: number) => cutCornerOutline(l, w, 0);
const baguetteOutline = rectangleOutline;
const oldMineOutline = (l: number, w: number) => cushionOutline(l, w, 2.6);
const roseOutline = (l: number) => roundOutline(l, 12);
const brioletteOutlineLW = (l: number, w: number) =>
  brioletteOutline(l, w, BRIOLETTE.shoulder);

export const CAD_CUTS: readonly CadCut[] = [
  {
    id: "round",
    label: "Round",
    centre: true,
    family: "brilliant",
    ratio: 1,
    outline: roundOutlineLW,
    build: brilliant(roundOutlineLW, ROUND),
  },
  {
    id: "oval",
    label: "Oval",
    centre: true,
    family: "brilliant",
    ratio: 1.4,
    outline: ovalOutline,
    build: brilliant(ovalOutline, FANCY),
  },
  {
    id: "cushion",
    label: "Cushion",
    centre: true,
    family: "brilliant",
    ratio: 1.05,
    outline: cushionOutline,
    build: brilliant(cushionOutline, CUSHION),
  },
  {
    id: "pear",
    label: "Pear",
    centre: true,
    family: "brilliant",
    ratio: 1.6,
    outline: pearOutline,
    build: brilliant(pearOutline, FANCY),
  },
  {
    id: "marquise",
    label: "Marquise",
    centre: true,
    family: "brilliant",
    ratio: 2,
    outline: marquiseOutline,
    build: brilliant(marquiseOutline, FANCY),
  },
  {
    id: "heart",
    label: "Heart",
    centre: true,
    family: "brilliant",
    ratio: 1,
    outline: (l, w) => heartOutline(l, w),
    build: (l, w) => buildHeartCutSolid(l, w),
  },
  {
    id: "princess",
    label: "Princess",
    centre: true,
    family: "mixed",
    ratio: 1,
    outline: rectangleOutline,
    build: (l, w) => buildChevronCutSolid(l, w, PRINCESS_CUT),
  },
  {
    id: "emerald",
    label: "Emerald",
    centre: true,
    family: "step",
    ratio: 1.45,
    outline: emeraldOutlineLW,
    build: (l, w) => buildStepCutSolid(emeraldOutline(l, w), EMERALD_STEP_CUT),
  },
  {
    id: "asscher",
    label: "Asscher",
    centre: true,
    family: "step",
    ratio: 1,
    outline: asscherOutlineLW,
    build: (l) => buildStepCutSolid(asscherOutline(l), ASSCHER_STEP_CUT),
  },
  {
    id: "radiant",
    label: "Radiant",
    centre: true,
    family: "mixed",
    ratio: 1.23,
    outline: radiantOutline,
    build: (l, w) => buildChevronCutSolid(l, w, RADIANT_CUT),
  },
  {
    id: "trillion",
    label: "Trillion",
    centre: true,
    family: "brilliant",
    ratio: Math.sqrt(3) / 2,
    outline: trillionCurved,
    build: brilliant(trillionCurved, TRILLION, { mains: 6, cornerKeys: true }),
  },
  {
    id: "kite",
    label: "Kite",
    centre: true,
    family: "step",
    ratio: 1.4,
    outline: kiteOutline,
    build: step(kiteOutline, ASSCHER_STEP_CUT),
  },
  {
    id: "baguette",
    label: "Baguette",
    centre: true,
    family: "step",
    ratio: 2.5,
    outline: baguetteOutline,
    build: step(baguetteOutline, SIDE_STEP_CUT),
  },
  {
    id: "tapered-baguette",
    label: "Tapered baguette",
    centre: false,
    family: "step",
    ratio: 2.4,
    outline: taperedBaguetteOutline,
    build: step(taperedBaguetteOutline, SIDE_STEP_CUT),
  },
  {
    id: "shield",
    label: "Shield",
    centre: true,
    family: "step",
    ratio: 1.1,
    outline: shieldOutline,
    build: step(shieldOutline, SIDE_STEP_CUT),
  },
  {
    id: "half-moon",
    label: "Half moon",
    centre: false,
    family: "step",
    ratio: 2,
    outline: halfMoonOutline,
    build: step(halfMoonOutline, SIDE_STEP_CUT),
  },
  {
    id: "hexagon",
    label: "Hexagon",
    centre: true,
    family: "step",
    ratio: 2 / Math.sqrt(3),
    outline: hexagonOutline,
    build: step(hexagonOutline, EMERALD_STEP_CUT),
  },
  {
    id: "octagon",
    label: "Octagon",
    centre: true,
    family: "step",
    ratio: 1,
    outline: octagonOutline,
    build: step(octagonOutline, ASSCHER_STEP_CUT),
  },
  {
    id: "old-european",
    label: "Old European",
    centre: true,
    family: "antique",
    ratio: 1,
    outline: roundOutlineLW,
    build: brilliant(roundOutlineLW, OLD_EUROPEAN),
  },
  {
    id: "old-mine",
    label: "Old mine",
    centre: true,
    family: "antique",
    ratio: 1.04,
    outline: oldMineOutline,
    build: brilliant(oldMineOutline, OLD_MINE),
  },
  {
    id: "rose",
    label: "Rose cut",
    centre: false,
    family: "antique",
    ratio: 1,
    outline: roseOutline,
    build: (l) => buildRoseCutSolid(l, DUTCH_ROSE),
  },
  {
    id: "briolette",
    label: "Briolette",
    centre: false,
    family: "antique",
    ratio: 1.6,
    outline: brioletteOutlineLW,
    build: (l, w) => buildBrioletteSolid(l, w, BRIOLETTE),
  },
];

export const CAD_CUT_IDS = CAD_CUTS.map((c) => c.id);

/** Cuts a ring's head can hold as its centre stone. */
export const CENTRE_STONE_CUTS = CAD_CUTS.filter((c) => c.centre);

export function getCadCut(id: CadCutId): CadCut {
  const cut = CAD_CUTS.find((c) => c.id === id);
  if (!cut) throw new Error(`Unknown cut: ${id}`);
  return cut;
}

export function isCadCutId(id: string): id is CadCutId {
  return CAD_CUTS.some((c) => c.id === id);
}

/** Small round brilliant for pavé / halo work; a 16-facet girdle keeps melee light. */
export function buildRoundMelee(diameter: number): THREE.BufferGeometry {
  return buildBrilliantSolid(roundOutline(diameter, 48), ROUND, {
    girdleFacets: 16,
  });
}
