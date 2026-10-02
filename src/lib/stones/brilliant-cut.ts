/**
 * Brilliant-cut proportions. Stones are built from facet planes by `buildBrilliantSolid`
 * (`brilliant-solid.ts`) on any convex outline; these are the numbers it is built to.
 */
export type BrilliantProportions = {
  /** Table diameter as a fraction of girdle diameter (Tolkowsky ideal ≈ 0.53). */
  table: number;
  /** Crown angle in degrees (ideal ≈ 34.5). */
  crownAngle: number;
  /** Pavilion angle in degrees (ideal ≈ 40.75). */
  pavilionAngle: number;
  /** Girdle thickness as a fraction of girdle diameter. */
  girdle: number;
  /** Star facet length, 0..1 across the table-edge → girdle span (ideal ≈ 0.5). */
  starLength: number;
  /** Star facet angle in degrees — shallower than the crown, which separates the planes. */
  starAngle: number;
  /** Lower-girdle length, 0..1 from girdle toward culet (ideal ≈ 0.77). */
  lowerGirdleLength: number;
  /** Culet radius as a fraction of girdle radius; 0 gives a true point. */
  culet: number;
};

export const IDEAL_ROUND_BRILLIANT: BrilliantProportions = {
  table: 0.53,
  crownAngle: 34.5,
  pavilionAngle: 40.75,
  girdle: 0.03,
  starLength: 0.5,
  starAngle: 22,
  lowerGirdleLength: 0.77,
  culet: 0.0,
};
