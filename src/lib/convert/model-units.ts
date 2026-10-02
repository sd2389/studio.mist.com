import * as THREE from "three";

/**
 * Real-world scale for uploads. Jewelry CAD is authored in millimetres, but exports arrive in
 * metres (Blender, glTF), inches or microns, sometimes with the unit declared wrongly. The
 * model is normalised so one world unit is one millimetre before display fitting, and the
 * decision is recorded on `root.userData.devjewelsUnits` (exported to the GLB as extras).
 */

export type ModelUnitsSource = "declared" | "detected" | "assumed";

export type ModelUnits = {
  /** Millimetres per source-file unit. */
  mmPerUnit: number;
  source: ModelUnitsSource;
  /** Bounding-box size of the whole piece in millimetres. */
  sizeMm: [number, number, number];
};

/** A whole piece of jewelry spans roughly a 1.5 mm stud to a 1 m necklace. */
const MIN_PLAUSIBLE_MM = 1.5;
const MAX_PLAUSIBLE_MM = 1000;
/** Typical piece size used to pick between unit guesses (a ring is ~20–25 mm). */
const TYPICAL_PIECE_MM = 25;
/** Conventional export units, in the order a mis-scaled jewelry file most often uses them. */
const CANDIDATE_MM_PER_UNIT = [1000, 25.4, 10, 0.001];

function isPlausible(maxEdgeMm: number): boolean {
  return maxEdgeMm >= MIN_PLAUSIBLE_MM && maxEdgeMm <= MAX_PLAUSIBLE_MM;
}

/** Millimetres per unit for a model whose largest extent is `maxEdge` file units. */
export function resolveMmPerUnit(
  maxEdge: number,
  declaredMmPerUnit: number | null = null,
): { mmPerUnit: number; source: ModelUnitsSource } {
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) return { mmPerUnit: declaredMmPerUnit ?? 1, source: "assumed" };
  if (declaredMmPerUnit && isPlausible(maxEdge * declaredMmPerUnit)) {
    return { mmPerUnit: declaredMmPerUnit, source: "declared" };
  }
  if (isPlausible(maxEdge)) return { mmPerUnit: 1, source: "assumed" };
  const plausible = CANDIDATE_MM_PER_UNIT.filter((factor) => isPlausible(maxEdge * factor));
  if (plausible.length === 0) return { mmPerUnit: 1, source: "assumed" };
  const distance = (factor: number) => Math.abs(Math.log((maxEdge * factor) / TYPICAL_PIECE_MM));
  const best = plausible.reduce((a, b) => (distance(b) < distance(a) ? b : a));
  return { mmPerUnit: best, source: "detected" };
}

/** Rhino `UnitSystem` enum values → millimetres per unit. */
const RHINO_MM_PER_UNIT: Record<number, number> = {
  1: 0.001, // microns
  2: 1, // millimetres
  3: 10, // centimetres
  4: 1000, // metres
  7: 0.0254, // mils
  8: 25.4, // inches
  9: 304.8, // feet
  13: 1e-6, // nanometres
  14: 100, // decimetres
};

export function mmPerRhinoUnit(unitSystem: unknown): number | null {
  const value = typeof unitSystem === "object" && unitSystem !== null
    ? (unitSystem as { value?: unknown }).value
    : unitSystem;
  return typeof value === "number" ? (RHINO_MM_PER_UNIT[value] ?? null) : null;
}

/** 3MF `<model unit="…">` values → millimetres per unit (spec default: millimetre). */
const THREE_MF_MM_PER_UNIT: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

export function mmPerThreeMfUnit(unit: string | null): number | null {
  return THREE_MF_MM_PER_UNIT[(unit ?? "millimeter").toLowerCase()] ?? null;
}

/** FBX `UnitScaleFactor` is centimetres per unit. */
export function mmPerFbxUnit(unitScaleFactor: unknown): number | null {
  return typeof unitScaleFactor === "number" && unitScaleFactor > 0 ? unitScaleFactor * 10 : null;
}

/** Scale `root` so one world unit is a millimetre, and record what was decided. */
export function normalizeModelUnits(root: THREE.Object3D, declaredMmPerUnit: number | null): ModelUnits {
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const { mmPerUnit, source } = resolveMmPerUnit(Math.max(size.x, size.y, size.z), declaredMmPerUnit);
  root.scale.multiplyScalar(mmPerUnit);
  root.updateMatrixWorld(true);
  const units: ModelUnits = {
    mmPerUnit,
    source,
    sizeMm: [size.x * mmPerUnit, size.y * mmPerUnit, size.z * mmPerUnit],
  };
  root.userData.devjewelsUnits = units;
  return units;
}
