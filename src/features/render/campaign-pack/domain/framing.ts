import type { Vec3 } from "./types";

/**
 * Auto-framing for a perspective camera: fit sampled model points inside the frame minus a
 * margin, then shift the aim point until the projected bounds are centred.
 */

export type FrameViewInput = {
  points: readonly Vec3[];
  /** Aim point used when there are no points to fit. */
  center: Vec3;
  /** Unit-ish vector from the subject toward the camera. */
  direction: Vec3;
  up?: Vec3;
  fovYDeg: number;
  aspect: number;
  /** Fraction of the frame left empty on every side (0.08 = 8%). */
  margin: number;
};

export type CameraPlacement = {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  distance: number;
};

type Basis = { back: Vec3; right: Vec3; up: Vec3 };

const WORLD_UP: Vec3 = [0, 1, 0];
/** Looking straight down: screen-up points to the back of the piece (-Z). */
const TOP_VIEW_UP: Vec3 = [0, 0, -1];
const MAX_CENTERING_PASSES = 8;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-12 ? scale(v, 1 / length) : [0, 0, 1];
}

export function cameraBasis(direction: Vec3, upHint: Vec3 = WORLD_UP): Basis {
  const back = normalize(direction);
  const hint = Math.abs(dot(back, normalize(upHint))) > 0.999 ? TOP_VIEW_UP : upHint;
  const right = normalize(cross(hint, back));
  return { back, right, up: cross(back, right) };
}

function frustumSlopes(fovYDeg: number, aspect: number, margin: number) {
  const usable = Math.max(0.05, 1 - 2 * Math.min(Math.max(margin, 0), 0.45));
  const tanY = Math.tan((fovYDeg * Math.PI) / 360);
  return { tanX: tanY * aspect * usable, tanY: tanY * usable };
}

type Local = { x: number; y: number; z: number };

function toLocal(points: readonly Vec3[], target: Vec3, basis: Basis): Local[] {
  return points.map((point) => {
    const rel = sub(point, target);
    return { x: dot(rel, basis.right), y: dot(rel, basis.up), z: dot(rel, basis.back) };
  });
}

function boundsRadius(local: Local[]): number {
  return Math.sqrt(local.reduce((max, p) => Math.max(max, p.x * p.x + p.y * p.y + p.z * p.z), 0));
}

/** Smallest distance along `back` that keeps every point inside the slopes. */
function fitDistance(local: Local[], tanX: number, tanY: number): number {
  let distance = 0;
  let nearest = -Infinity;
  for (const p of local) {
    distance = Math.max(distance, p.z + Math.max(Math.abs(p.x) / tanX, Math.abs(p.y) / tanY));
    nearest = Math.max(nearest, p.z);
  }
  // Never let the camera sit on (or inside) the closest point.
  return Math.max(distance, nearest + boundsRadius(local) * 0.05, 1e-4);
}

type Extremes = { minX: Local; maxX: Local; minY: Local; maxY: Local };

function screenExtremes(local: Local[], distance: number): Extremes {
  let ext: Extremes = { minX: local[0]!, maxX: local[0]!, minY: local[0]!, maxY: local[0]! };
  const sx = (p: Local) => p.x / Math.max(distance - p.z, 1e-9);
  const sy = (p: Local) => p.y / Math.max(distance - p.z, 1e-9);
  for (const p of local) {
    ext = {
      minX: sx(p) < sx(ext.minX) ? p : ext.minX,
      maxX: sx(p) > sx(ext.maxX) ? p : ext.maxX,
      minY: sy(p) < sy(ext.minY) ? p : ext.minY,
      maxY: sy(p) > sy(ext.maxY) ? p : ext.maxY,
    };
  }
  return ext;
}

/**
 * Lateral shift (world units, camera axes) that puts the two extreme points symmetric on
 * screen: solves (a - s)/da + (b - s)/db = 0 for each axis.
 */
function centeringShift(local: Local[], distance: number): { x: number; y: number } {
  const ext = screenExtremes(local, distance);
  const solve = (a: Local, b: Local, key: "x" | "y") => {
    const wa = 1 / Math.max(distance - a.z, 1e-9);
    const wb = 1 / Math.max(distance - b.z, 1e-9);
    return (a[key] * wa + b[key] * wb) / (wa + wb);
  };
  return { x: solve(ext.minX, ext.maxX, "x"), y: solve(ext.minY, ext.maxY, "y") };
}

export function frameView(input: FrameViewInput): CameraPlacement {
  const basis = cameraBasis(input.direction, input.up);
  const { tanX, tanY } = frustumSlopes(input.fovYDeg, input.aspect, input.margin);
  // Start from the points' own bounds centre; centring then corrects for perspective.
  let target = boundsFromPoints(input.points)?.center ?? input.center;
  if (input.points.length === 0) {
    return { position: add(target, basis.back), target, up: basis.up, distance: 1 };
  }
  let local = toLocal(input.points, target, basis);
  let distance = fitDistance(local, tanX, tanY);
  const tolerance = boundsRadius(local) * 1e-9;
  for (let pass = 0; pass < MAX_CENTERING_PASSES; pass += 1) {
    const shift = centeringShift(local, distance);
    if (Math.abs(shift.x) <= tolerance && Math.abs(shift.y) <= tolerance) break;
    target = add(target, add(scale(basis.right, shift.x), scale(basis.up, shift.y)));
    local = toLocal(input.points, target, basis);
    distance = fitDistance(local, tanX, tanY);
  }
  return { position: add(target, scale(basis.back, distance)), target, up: basis.up, distance };
}

export type OrbitFitInput = {
  points: readonly Vec3[];
  target: Vec3;
  elevationDeg: number;
  fovYDeg: number;
  aspect: number;
  margin: number;
  samples?: number;
};

/** Distance that keeps the subject inside the margins at every azimuth of a full orbit. */
export function fitOrbitDistance(input: OrbitFitInput): number {
  const samples = Math.max(4, input.samples ?? 48);
  const { tanX, tanY } = frustumSlopes(input.fovYDeg, input.aspect, input.margin);
  const elevation = (input.elevationDeg * Math.PI) / 180;
  let distance = 1e-4;
  for (let i = 0; i < samples; i += 1) {
    const azimuth = (i / samples) * Math.PI * 2;
    const direction: Vec3 = [
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    ];
    const local = toLocal(input.points, input.target, cameraBasis(direction));
    distance = Math.max(distance, fitDistance(local, tanX, tanY));
  }
  // Between samples the silhouette can be a hair wider; pad by the sampling chord.
  return distance * (1 + (Math.PI / samples) ** 2 / 2);
}

/** Normalised device coordinates of `point` as seen from `placement` (tests, debugging). */
export function projectToNdc(
  placement: CameraPlacement,
  point: Vec3,
  fovYDeg: number,
  aspect: number,
): [number, number] {
  const basis = cameraBasis(sub(placement.position, placement.target), placement.up);
  const rel = sub(point, placement.position);
  const depth = -dot(rel, basis.back);
  const tanY = Math.tan((fovYDeg * Math.PI) / 360);
  return [dot(rel, basis.right) / depth / (tanY * aspect), dot(rel, basis.up) / depth / tanY];
}

export type ModelBounds = { points: readonly Vec3[]; center: Vec3; radius: number };

export function boundsFromPoints(points: readonly Vec3[]): ModelBounds | null {
  if (points.length === 0) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, p[axis]!);
      max[axis] = Math.max(max[axis]!, p[axis]!);
    }
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - center[0], max[1] - center[1], max[2] - center[2]);
  return { points, center, radius };
}
