import * as THREE from "three";
import { IDEAL_ROUND_BRILLIANT, type BrilliantProportions } from "@/lib/stones/brilliant-cut";
import { brilliantKeys } from "@/lib/stones/brilliant-keys";
import { buildFacetSolid, planeFromPoints, planeThrough, type FacetPlane } from "@/lib/stones/facet-solid";
import { outlineExtents, sampleOutlineEvenly, vertexNormal, type GirdleOutline, type OutlineSample } from "@/lib/stones/outlines";

/**
 * Facet-plane brilliant on any convex outline: the round brilliant's facets (table,
 * kites, stars, upper halves, pavilion mains, lower halves) around `mains` main
 * directions, plus a faceted girdle — each defined as a plane the way a cutter defines it,
 * then intersected into the solid.
 *
 * Facets with eight mains: crown 1 + 8 + 8 + 16 = 33, pavilion 8 + 16 = 24, so 57; a
 * culet makes 58 and a girdle row (see `GirdleRow`) adds 16. On a straight side, the two
 * halves either side of a star are one plane and are cut as one facet (straight trillion).
 */

const UP = new THREE.Vector3(0, 1, 0);

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function horizontal(n: { x: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(n.x, 0, n.z).normalize();
}

/** Point common to three planes (Cramer's rule on the plane normals). */
export function intersectPlanes(a: FacetPlane, b: FacetPlane, c: FacetPlane): THREE.Vector3 {
  const bc = new THREE.Vector3().crossVectors(b.normal, c.normal);
  const ca = new THREE.Vector3().crossVectors(c.normal, a.normal);
  const ab = new THREE.Vector3().crossVectors(a.normal, b.normal);
  const det = a.normal.dot(bc);
  return bc.multiplyScalar(a.offset).add(ca.multiplyScalar(b.offset)).add(ab.multiplyScalar(c.offset)).divideScalar(det);
}

/** Plane containing the line a→b whose normal is as close as possible to `ideal`. */
function planeThroughLine(a: THREE.Vector3, b: THREE.Vector3, ideal: THREE.Vector3): FacetPlane {
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const n = ideal.clone().addScaledVector(dir, -ideal.dot(dir)).normalize();
  return planeThrough(n, a);
}

function tilted(outward: THREE.Vector3, angleDeg: number, vertical: number): THREE.Vector3 {
  const t = toRad(angleDeg);
  return outward.clone().multiplyScalar(Math.sin(t)).addScaledVector(UP, vertical * Math.cos(t));
}

/** Snap a sample's normal to the corner bisector when it lands on a true corner. */
function keyNormal(outline: GirdleOutline, sample: OutlineSample): { x: number; z: number } {
  for (const i of outline.corners) {
    const c = outline.points[i]!;
    if (Math.hypot(c.x - sample.point.x, c.z - sample.point.z) < 1e-6) return vertexNormal(outline, i);
  }
  return sample.normal;
}

function girdlePlanes(outline: GirdleOutline, facets: number): FacetPlane[] {
  const planes = sampleOutlineEvenly(outline, facets).map((s) =>
    planeThrough(horizontal(s.normal), new THREE.Vector3(s.point.x, 0, s.point.z)),
  );
  // True corners (marquise tips, princess corners) keep both edges so the point stays sharp.
  const pts = outline.points;
  for (const i of outline.corners) {
    const p = pts[i]!;
    for (const j of [i, (i + pts.length - 1) % pts.length]) {
      const a = pts[j]!;
      const b = pts[(j + 1) % pts.length]!;
      planes.push(planeThrough(new THREE.Vector3(b.z - a.z, 0, -(b.x - a.x)), new THREE.Vector3(p.x, 0, p.z)));
    }
  }
  return planes;
}

/**
 * An extra row of facets between the girdle and the pavilion mains — the "cushion
 * modified" / radiant pavilion, where the mains and lower halves no longer reach the
 * girdle. The row is steeper than the mains, which convexity requires.
 */
export type GirdleRow = {
  /** Row facet angle in degrees. */
  angle: number;
  /** How far in from the girdle the row reaches, as a fraction of the depth radius. */
  width: number;
};

type Frame = {
  outline: GirdleOutline;
  p: BrilliantProportions;
  keys: OutlineSample[];
  mains: number;
  /** Radius the crown and pavilion angles are measured at. */
  radius: number;
  gTop: number;
  gBot: number;
  pointCulet: boolean;
  row: GirdleRow | null;
};

const at = (key: OutlineSample, y: number) => new THREE.Vector3(key.point.x, y, key.point.z);

type Crown = { tableY: number; kites: FacetPlane[]; tableCorners: THREE.Vector3[] };

function crownKites(f: Frame): Crown {
  const tableY = f.gTop + f.radius * (1 - f.p.table) * Math.tan(toRad(f.p.crownAngle));
  const kites: FacetPlane[] = [];
  const tableCorners: THREE.Vector3[] = [];
  for (let j = 0; j < f.mains; j++) {
    const key = f.keys[j * 2]!;
    // The table is the key polygon scaled by the table fraction; each kite runs from its
    // girdle main up to its table corner. On a round that is exactly the crown angle; on
    // fancy shapes the angle varies around the stone, as it does on a real one.
    const corner = new THREE.Vector3(key.point.x * f.p.table, tableY, key.point.z * f.p.table);
    tableCorners.push(corner);
    kites.push(planeThroughLine(at(key, f.gTop), corner, tilted(horizontal(keyNormal(f.outline, key)), f.p.crownAngle, 1)));
  }
  return { tableY, kites, tableCorners };
}

function starTip(f: Frame, c: Crown, j: number, starAngle: number): { plane: FacetPlane; tip: THREE.Vector3 } {
  const t0 = c.tableCorners[j]!;
  const t1 = c.tableCorners[(j + 1) % f.mains]!;
  const key = f.keys[j * 2 + 1]!;
  const plane = planeThroughLine(t0, t1, tilted(horizontal(key.normal), starAngle, 1));
  const tip = intersectPlanes(c.kites[j]!, c.kites[(j + 1) % f.mains]!, plane);
  return { plane, tip };
}

function starFraction(f: Frame, c: Crown, j: number, tip: THREE.Vector3): number {
  const t0 = c.tableCorners[j]!;
  const t1 = c.tableCorners[(j + 1) % f.mains]!;
  const key = f.keys[j * 2 + 1]!;
  const inner = Math.hypot((t0.x + t1.x) / 2, (t0.z + t1.z) / 2);
  const outer = Math.hypot(key.point.x, key.point.z);
  return (Math.hypot(tip.x, tip.z) - inner) / Math.max(1e-9, outer - inner);
}

/** Star facets, with the star angle solved so each star reaches `starLength`. */
function solveStars(f: Frame, c: Crown): Array<{ plane: FacetPlane; tip: THREE.Vector3 }> {
  const out: Array<{ plane: FacetPlane; tip: THREE.Vector3 }> = [];
  for (let j = 0; j < f.mains; j++) {
    let lo = 2;
    let hi = f.p.crownAngle - 0.5;
    let best = starTip(f, c, j, f.p.starAngle);
    for (let it = 0; it < 32; it++) {
      const mid = (lo + hi) / 2;
      best = starTip(f, c, j, mid);
      if (starFraction(f, c, j, best.tip) < f.p.starLength) lo = mid;
      else hi = mid;
    }
    out.push(best);
  }
  return out;
}

function crownPlanes(f: Frame): FacetPlane[] {
  const crown = crownKites(f);
  const planes: FacetPlane[] = [planeThrough(UP.clone(), new THREE.Vector3(0, crown.tableY, 0)), ...crown.kites];
  const girdlePoint = (k: number) => at(f.keys[k % f.keys.length]!, f.gTop);
  solveStars(f, crown).forEach(({ plane, tip }, j) => {
    const k = j * 2;
    planes.push(plane);
    planes.push(planeFromPoints(tip, girdlePoint(k), girdlePoint(k + 1)));
    planes.push(planeFromPoints(tip, girdlePoint(k + 1), girdlePoint(k + 2)));
  });
  return planes;
}

/**
 * Keel point a main runs down to: the culet on a round, a point on the keel line (along the
 * length axis) on elongated shapes, so every main meets the bottom the way a real one does.
 */
function keelPoint(f: Frame, x: number, keelY: number): THREE.Vector3 {
  if (f.pointCulet) return new THREE.Vector3(0, keelY, 0);
  const ext = outlineExtents(f.outline);
  const forward = Math.max(0, ext.maxX - f.radius);
  const back = Math.max(0, -ext.minX - f.radius);
  return new THREE.Vector3(THREE.MathUtils.clamp(x, -back, forward), keelY, 0);
}

function pavilionPlanes(f: Frame): FacetPlane[] {
  const pav = Math.tan(toRad(f.p.pavilionAngle));
  const run = f.row ? f.row.width * f.radius : 0;
  const rowSlope = f.row ? Math.tan(toRad(f.row.angle)) : 0;
  // Where the mains and lower halves start: the girdle, or the girdle row's lower edge.
  const anchorY = f.gBot - run * rowSlope;
  const anchor = (k: number) => {
    const key = f.keys[k % f.keys.length]!;
    return at(key, anchorY).addScaledVector(horizontal(keyNormal(f.outline, key)), -run);
  };
  const keelY = anchorY - (f.radius - run) * pav;
  const planes: FacetPlane[] = [];
  const mains: FacetPlane[] = [];
  for (let j = 0; j < f.mains; j++) {
    const key = f.keys[j * 2]!;
    const bottom = keelPoint(f, key.point.x, keelY);
    mains.push(planeThroughLine(anchor(j * 2), bottom, tilted(horizontal(keyNormal(f.outline, key)), f.p.pavilionAngle, -1)));
  }
  planes.push(...mains);
  // Lower-girdle halves meet on the edge between two mains at `lowerGirdleLength` of the depth.
  const junctionY = anchorY + f.p.lowerGirdleLength * (keelY - anchorY);
  const level: FacetPlane = { normal: new THREE.Vector3(0, -1, 0), offset: -junctionY };
  for (let j = 0; j < f.mains; j++) {
    const junction = intersectPlanes(mains[j]!, mains[(j + 1) % f.mains]!, level);
    const k = j * 2;
    planes.push(planeFromPoints(junction, anchor(k), anchor(k + 1)));
    planes.push(planeFromPoints(junction, anchor(k + 1), anchor(k + 2)));
  }
  if (f.row) {
    for (const key of f.keys) planes.push(planeThrough(tilted(horizontal(keyNormal(f.outline, key)), f.row.angle, -1), at(key, f.gBot)));
  }
  if (f.p.culet > 0) {
    // The culet is polished square to the axis where the mains are `culet` radii across.
    planes.push({ normal: new THREE.Vector3(0, -1, 0), offset: -(keelY + f.p.culet * f.radius * pav) });
  }
  return planes;
}

export type BrilliantSolidOptions = {
  /** Vertical girdle facets; a multiple of 16 keeps the mains on girdle facets. */
  girdleFacets?: number;
  /** Number of pavilion mains (8 on most brilliants, 6 on a trillion). */
  mains?: number;
  /** Put a main on every true corner and spread the rest along the sides. */
  cornerKeys?: boolean;
  /** Radius the crown and pavilion angles are measured at (default: half the narrow width). */
  depthRadius?: number;
  /** Mains meet at one point under the centre instead of along a keel. */
  pointCulet?: boolean;
  girdleRow?: GirdleRow;
};

/**
 * Faceted brilliant on any convex outline, built from facet planes. Units follow the
 * outline. The girdle's mid-plane is y = 0 and the table faces +y; the result is closed,
 * convex, flat-shaded and non-indexed.
 */
export function buildBrilliantSolid(
  outline: GirdleOutline,
  p: BrilliantProportions = IDEAL_ROUND_BRILLIANT,
  options: BrilliantSolidOptions = {},
): THREE.BufferGeometry {
  const { planes, scale } = brilliantPlanes(outline, p, options);
  return buildFacetSolid(planes, scale);
}

/** The brilliant's facet planes (and its size, for weld tolerances), for solids built from more than one piece. */
export function brilliantPlanes(
  outline: GirdleOutline,
  p: BrilliantProportions = IDEAL_ROUND_BRILLIANT,
  options: BrilliantSolidOptions = {},
): { planes: FacetPlane[]; scale: number } {
  const ext = outlineExtents(outline);
  const halfWidth = Math.min(ext.maxX - ext.minX, ext.maxZ - ext.minZ) / 2;
  const mains = options.mains ?? 8;
  const girdle = p.girdle * halfWidth * 2;
  const frame: Frame = {
    outline,
    p,
    keys: brilliantKeys(outline, mains, { cornerKeys: options.cornerKeys ?? false }),
    mains,
    radius: options.depthRadius ?? halfWidth,
    gTop: girdle / 2,
    gBot: -girdle / 2,
    pointCulet: options.pointCulet ?? false,
    row: options.girdleRow ?? null,
  };
  const planes = [...crownPlanes(frame), ...girdlePlanes(outline, options.girdleFacets ?? 32), ...pavilionPlanes(frame)];
  return { planes, scale: halfWidth * 2 };
}
