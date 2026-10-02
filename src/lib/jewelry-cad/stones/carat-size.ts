import type { CadCutId } from "@/lib/stones/cad-cuts";

/**
 * Carat ↔ millimetre sizing for diamonds, from standard grading charts.
 *
 * Round brilliants use the full melee-to-5 ct chart. Fancy shapes use the chart's 1 ct
 * face-up size and scale with the cube root of weight — which is how those charts are
 * built in the first place (weight follows volume, volume follows size³).
 */

/** [carat, diameter mm] for an ideal round brilliant (≈61% depth). */
export const ROUND_BRILLIANT_CHART: ReadonlyArray<readonly [number, number]> = [
  [0.005, 1.0],
  [0.01, 1.3],
  [0.015, 1.5],
  [0.02, 1.7],
  [0.03, 2.0],
  [0.04, 2.2],
  [0.05, 2.4],
  [0.07, 2.7],
  [0.1, 3.0],
  [0.15, 3.4],
  [0.2, 3.8],
  [0.25, 4.1],
  [0.33, 4.4],
  [0.4, 4.8],
  [0.5, 5.2],
  [0.6, 5.4],
  [0.7, 5.7],
  [0.75, 5.8],
  [0.8, 6.0],
  [0.9, 6.2],
  [1.0, 6.5],
  [1.25, 6.9],
  [1.5, 7.4],
  [1.75, 7.8],
  [2.0, 8.2],
  [2.5, 8.8],
  [3.0, 9.3],
  [3.5, 9.8],
  [4.0, 10.2],
  [5.0, 11.1],
];

/** Face-up length × width (mm) of a 1 ct diamond per shape, at the shape's usual ratio. */
export const ONE_CARAT_SIZE_MM: Readonly<Record<CadCutId, readonly [number, number]>> = {
  round: [6.5, 6.5],
  oval: [7.7, 5.7],
  cushion: [6.0, 5.6],
  pear: [8.0, 5.0],
  marquise: [10.0, 5.0],
  heart: [6.5, 6.5],
  princess: [5.5, 5.5],
  emerald: [7.0, 5.0],
  asscher: [5.5, 5.5],
  radiant: [6.4, 5.2],
  trillion: [6.5, 7.5],
  kite: [8.4, 6.0],
  baguette: [9.5, 3.8],
  "tapered-baguette": [9.5, 4.0],
  shield: [7.0, 6.4],
  "half-moon": [8.6, 4.3],
  hexagon: [7.0, 6.1],
  octagon: [5.8, 5.8],
  "old-european": [6.3, 6.3],
  "old-mine": [6.0, 5.8],
  rose: [7.8, 7.8],
  briolette: [8.0, 5.0],
};

export const DIAMOND_SPECIFIC_GRAVITY = 3.52;

const cbrt = Math.cbrt;

/** Round diameter for a carat weight: chart interpolation in cube-root space. */
export function roundDiameterForCarat(carat: number): number {
  const chart = ROUND_BRILLIANT_CHART;
  const first = chart[0]!;
  const last = chart[chart.length - 1]!;
  if (carat <= first[0]) return first[1] * cbrt(carat / first[0]);
  if (carat >= last[0]) return last[1] * cbrt(carat / last[0]);
  for (let i = 0; i + 1 < chart.length; i++) {
    const [c0, d0] = chart[i]!;
    const [c1, d1] = chart[i + 1]!;
    if (carat <= c1) {
      const t = (cbrt(carat) - cbrt(c0)) / (cbrt(c1) - cbrt(c0));
      return d0 + (d1 - d0) * t;
    }
  }
  return last[1];
}

/** Inverse of `roundDiameterForCarat` (used to weigh melee from their size). */
export function roundCaratForDiameter(diameterMm: number): number {
  const chart = ROUND_BRILLIANT_CHART;
  const first = chart[0]!;
  const last = chart[chart.length - 1]!;
  if (diameterMm <= first[1]) return first[0] * (diameterMm / first[1]) ** 3;
  if (diameterMm >= last[1]) return last[0] * (diameterMm / last[1]) ** 3;
  for (let i = 0; i + 1 < chart.length; i++) {
    const [c0, d0] = chart[i]!;
    const [c1, d1] = chart[i + 1]!;
    if (diameterMm <= d1) {
      const t = (diameterMm - d0) / (d1 - d0);
      return (cbrt(c0) + (cbrt(c1) - cbrt(c0)) * t) ** 3;
    }
  }
  return last[0];
}

export type StoneSize = { length: number; width: number };

/** Face-up size of a diamond of this cut and weight. */
export function diamondSizeForCarat(cut: CadCutId, carat: number): StoneSize {
  if (cut === "round") {
    const d = roundDiameterForCarat(carat);
    return { length: d, width: d };
  }
  const [l, w] = ONE_CARAT_SIZE_MM[cut];
  const k = cbrt(carat);
  return { length: l * k, width: w * k };
}

/**
 * Face-up size for a gem of the given specific gravity: a denser stone of the same weight
 * is smaller (a 1 ct sapphire, SG 4.0, is ~4% smaller than a 1 ct diamond).
 */
export function stoneSizeForCarat(cut: CadCutId, carat: number, specificGravity = DIAMOND_SPECIFIC_GRAVITY): StoneSize {
  const size = diamondSizeForCarat(cut, carat);
  const k = cbrt(DIAMOND_SPECIFIC_GRAVITY / specificGravity);
  return { length: size.length * k, width: size.width * k };
}
