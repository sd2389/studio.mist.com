/**
 * US / Canada ring sizes (ANSI scale): size 0 is 11.63 mm inside diameter and every whole
 * size adds 0.8128 mm (0.032 in). This module is the single source of truth for ring
 * sizing; everything else asks it for a diameter.
 */

export const US_RING_SIZE_MIN = 3;
export const US_RING_SIZE_MAX = 13;
export const US_RING_SIZE_STEP = 0.25;

const SIZE_ZERO_DIAMETER_MM = 11.63;
const MM_PER_SIZE = 0.8128;

export type RingSizeRow = {
  us: number;
  /** Inside diameter in mm. */
  diameterMm: number;
  /** Inside circumference in mm. */
  circumferenceMm: number;
  /** ISO 8653 / EU size: the inside circumference in whole mm. */
  eu: number;
};

/** Inside diameter (mm) for a US size; accepts any value, the table covers 3–13. */
export function usSizeToInnerDiameterMm(size: number): number {
  return SIZE_ZERO_DIAMETER_MM + MM_PER_SIZE * size;
}

export function innerDiameterToUsSize(diameterMm: number): number {
  return (diameterMm - SIZE_ZERO_DIAMETER_MM) / MM_PER_SIZE;
}

/** Snap to the nearest quarter size inside the supported range. */
export function clampUsSize(size: number): number {
  const snapped = Math.round(size / US_RING_SIZE_STEP) * US_RING_SIZE_STEP;
  return Math.min(US_RING_SIZE_MAX, Math.max(US_RING_SIZE_MIN, snapped));
}

function row(us: number): RingSizeRow {
  const diameterMm = usSizeToInnerDiameterMm(us);
  const circumferenceMm = Math.PI * diameterMm;
  return {
    us,
    diameterMm: Math.round(diameterMm * 100) / 100,
    circumferenceMm: Math.round(circumferenceMm * 10) / 10,
    eu: Math.round(circumferenceMm),
  };
}

const QUARTER_STEPS = Math.round((US_RING_SIZE_MAX - US_RING_SIZE_MIN) / US_RING_SIZE_STEP);

/** US 3 → 13 in quarter sizes (41 rows). */
export const RING_SIZE_TABLE: readonly RingSizeRow[] = Array.from({ length: QUARTER_STEPS + 1 }, (_, i) =>
  row(US_RING_SIZE_MIN + i * US_RING_SIZE_STEP),
);

/** US 3 → 13 in half sizes — the set shipped in the all-sizes STL pack. */
export const HALF_RING_SIZES: readonly number[] = RING_SIZE_TABLE.filter((r) => Number.isInteger(r.us * 2)).map((r) => r.us);

export function ringSizeRow(size: number): RingSizeRow {
  return RING_SIZE_TABLE.find((r) => r.us === clampUsSize(size)) ?? row(clampUsSize(size));
}

/** "6", "6¼", "6½", "6¾". */
export function formatUsSize(size: number): string {
  const whole = Math.floor(size);
  const frac = Math.round((size - whole) * 4);
  const glyph = ["", "¼", "½", "¾"][frac] ?? "";
  return `${whole}${glyph}`;
}
