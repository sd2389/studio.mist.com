import * as THREE from "three";
import type { FacetPlane } from "@/lib/stones/facet-solid";
import type { GirdleOutline, Vec2 } from "@/lib/stones/outlines";
import { buildSplitSolid } from "@/lib/stones/split-solid";

/**
 * Heart brilliant: two rounded lobes, a cleft between them and a point, faceted like the
 * modern 57-facet heart — eight bezels, eight stars and sixteen upper halves on the crown,
 * eight mains and sixteen lower halves on the pavilion. The point and the cleft each sit
 * between two mains, so the two halves of the stone mirror each other across its length.
 *
 * The cleft makes the stone concave, which no single intersection of facet planes can be:
 * it is built as two convex halves meeting on the plane through its length (z = 0).
 */

export type HeartCutProportions = {
  /** Lobe radius as a fraction of the half width; larger rounds the lobes and deepens the cleft. */
  lobe: number;
  /** Outward bow of the wings, as a sagitta over their chord. */
  wingBow: number;
  table: number;
  crownAngle: number;
  /** How much shallower the stars sit than the bezels, degrees. */
  starDrop: number;
  pavilionAngle: number;
  /** Lower halves reach this fraction of the way from the girdle to the culet. */
  lowerGirdleLength: number;
  girdle: number;
};

export const HEART_CUT: HeartCutProportions = {
  lobe: 0.58,
  wingBow: 0.06,
  table: 0.56,
  crownAngle: 34.5,
  starDrop: 15,
  pavilionAngle: 41,
  lowerGirdleLength: 0.78,
  girdle: 0.025,
};

const D2R = Math.PI / 180;
/** Keys from the point (0) round one half to the cleft (8): bezels and mains on odd keys. */
const HALF_KEYS = 8;
const GIRDLE_FACETS_PER_HALF = 24;

type Key = { p: Vec2; n: Vec2 };

/**
 * The +z half of the outline, from the point (on +x) counter-clockwise round the lobe to the
 * cleft (on the axis). Each lobe is a circle touching the top and the side of the stone's
 * bounding box; each wing a shallow arc from the point to where it meets the lobe.
 */
function heartHalfOutline(length: number, width: number, p: HeartCutProportions, samples = 64): Vec2[] {
  const hw = width / 2;
  const r = p.lobe * hw;
  const cx = -length / 2 + r, cz = hw - r;
  const tip = { x: length / 2, z: 0 };
  // Outer tangent from the point to the lobe circle.
  const dist = Math.hypot(cx - tip.x, cz - tip.z);
  const towards = Math.atan2(cz - tip.z, cx - tip.x) - Math.asin(r / dist);
  const reach = Math.sqrt(dist * dist - r * r);
  const join = { x: tip.x + Math.cos(towards) * reach, z: tip.z + Math.sin(towards) * reach };

  // Wing: a circular arc through the point and the join, bowed outward.
  const chord = Math.hypot(join.x - tip.x, join.z - tip.z);
  const ux = (join.x - tip.x) / chord, uz = (join.z - tip.z) / chord;
  const sagitta = p.wingBow * chord;
  const R = (chord * chord) / (8 * sagitta) + sagitta / 2;
  // Outward of a counter-clockwise outline is the chord direction turned clockwise.
  const wx = (tip.x + join.x) / 2 - uz * (R - sagitta), wz = (tip.z + join.z) / 2 + ux * (R - sagitta);
  const a0 = Math.atan2(tip.z - wz, tip.x - wx);
  let sweep = Math.atan2(join.z - wz, join.x - wx) - a0;
  if (sweep > Math.PI) sweep -= Math.PI * 2;
  if (sweep < -Math.PI) sweep += Math.PI * 2;
  const pts: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const a = a0 + (sweep * i) / samples;
    pts.push({ x: wx + Math.cos(a) * R, z: wz + Math.sin(a) * R });
  }

  // Lobe: from the join over the top to where the circle meets the axis — the cleft.
  const from = Math.atan2(join.z - cz, join.x - cx);
  const cleftX = cx - Math.sqrt(r * r - cz * cz);
  let to = Math.atan2(-cz, cleftX - cx);
  while (to < from) to += Math.PI * 2;
  for (let i = 1; i <= samples * 2; i++) {
    const a = from + ((to - from) * i) / (samples * 2);
    pts.push({ x: cx + Math.cos(a) * r, z: Math.max(0, cz + Math.sin(a) * r) });
  }
  pts[pts.length - 1] = { x: cleftX, z: 0 };
  return pts;
}

/** The whole outline, counter-clockwise from the point; its corners are the point and the cleft. */
export function heartOutline(length: number, width: number, p: HeartCutProportions = HEART_CUT): GirdleOutline {
  const half = heartHalfOutline(length, width, p);
  const mirrored = half.slice(1, -1).reverse().map((q) => ({ x: q.x, z: -q.z }));
  return { points: [...half, ...mirrored], corners: [0, half.length - 1] };
}

/** Point and outward normal at arc-length fraction f along an open polyline. */
function alongHalf(pts: Vec2[], f: number): Key {
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z));
  const s = f * lengths[lengths.length - 1]!;
  let i = 1;
  while (i < pts.length - 1 && lengths[i]! < s) i++;
  const a = pts[i - 1]!, b = pts[i]!;
  const t = (s - lengths[i - 1]!) / Math.max(1e-12, lengths[i]! - lengths[i - 1]!);
  const ex = b.x - a.x, ez = b.z - a.z, l = Math.hypot(ex, ez) || 1;
  return { p: { x: a.x + ex * t, z: a.z + ez * t }, n: { x: ez / l, z: -ex / l } };
}

const at = (k: Key, y: number) => new THREE.Vector3(k.p.x, y, k.p.z);

/** Facet normal leaning `deg` from vertical toward the outline normal `o`, up (1) or down (-1). */
function tilted(o: Vec2, deg: number, vertical: 1 | -1): THREE.Vector3 {
  const l = Math.hypot(o.x, o.z) || 1;
  const s = Math.sin(deg * D2R);
  return new THREE.Vector3((o.x / l) * s, vertical * Math.cos(deg * D2R), (o.z / l) * s);
}

/** The plane containing the line a–b whose normal is closest to `ideal`. */
function planeThroughLine(a: THREE.Vector3, b: THREE.Vector3, ideal: THREE.Vector3): FacetPlane {
  const dir = b.clone().sub(a).normalize();
  const normal = ideal.clone().addScaledVector(dir, -ideal.dot(dir)).normalize();
  return { normal, offset: normal.dot(a) };
}

function planeFrom3(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, inside: THREE.Vector3): FacetPlane {
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  if (normal.dot(inside.clone().sub(a)) > 0) normal.negate();
  return { normal, offset: normal.dot(a) };
}

function meet(a: FacetPlane, b: FacetPlane, c: FacetPlane): THREE.Vector3 {
  const bc = b.normal.clone().cross(c.normal), ca = c.normal.clone().cross(a.normal), ab = a.normal.clone().cross(b.normal);
  const det = a.normal.dot(bc);
  return bc.multiplyScalar(a.offset).add(ca.multiplyScalar(b.offset)).add(ab.multiplyScalar(c.offset)).divideScalar(det);
}

/** Facet planes of the +z half, the split plane (z ≥ 0) among them. */
function halfPlanes(length: number, width: number, p: HeartCutProportions): FacetPlane[] {
  const half = heartHalfOutline(length, width, p);
  const keys: Key[] = [];
  for (let k = 0; k <= HALF_KEYS; k++) keys.push(alongHalf(half, k / HALF_KEYS));
  keys[0] = { p: half[0]!, n: { x: 1, z: 0 } };
  keys[HALF_KEYS] = { p: half[half.length - 1]!, n: { x: -1, z: 0 } };
  const mirror = (k: Key): Key => ({ p: { x: k.p.x, z: -k.p.z }, n: { x: k.n.x, z: -k.n.z } });
  // Keys past either end are the other half's, mirrored: the point and cleft stars span both.
  const K = (k: number): Key => (k < 0 ? mirror(keys[-k]!) : k > HALF_KEYS ? mirror(keys[2 * HALF_KEYS - k]!) : keys[k]!);

  const hw = width / 2;
  const g = p.girdle * width;
  const gTop = g / 2, gBot = -g / 2;
  const tableY = gTop + hw * (1 - p.table) * Math.tan(p.crownAngle * D2R);
  const inside = new THREE.Vector3(0, 0, 0.3 * hw);
  const planes: FacetPlane[] = [{ normal: new THREE.Vector3(0, 1, 0), offset: tableY }];

  // Crown: bezels on the odd keys, from the girdle to the table's corners.
  const mains = [-1, 1, 3, 5, 7, 9];
  const corner = (k: number) => new THREE.Vector3(K(k).p.x * p.table, tableY, K(k).p.z * p.table);
  const bezel = new Map<number, FacetPlane>();
  for (const k of mains) bezel.set(k, planeThroughLine(at(K(k), gTop), corner(k), tilted(K(k).n, p.crownAngle, 1)));
  for (const k of [1, 3, 5, 7]) planes.push(bezel.get(k)!);
  for (const k of [0, 2, 4, 6, 8]) {
    const star = planeThroughLine(corner(k - 1), corner(k + 1), tilted(K(k).n, p.crownAngle - p.starDrop, 1));
    planes.push(star);
    const tip = meet(bezel.get(k - 1)!, bezel.get(k + 1)!, star);
    // Upper halves either side of the star, those in this half only.
    if (k > 0) planes.push(planeFrom3(tip, at(K(k - 1), gTop), at(K(k), gTop), inside));
    if (k < HALF_KEYS) planes.push(planeFrom3(tip, at(K(k), gTop), at(K(k + 1), gTop), inside));
  }

  // Pavilion: mains to a point culet under the centre, lower halves between them.
  const culet = new THREE.Vector3(0, gBot - hw * Math.tan(p.pavilionAngle * D2R), 0);
  const main = new Map<number, FacetPlane>();
  for (const k of mains) main.set(k, planeThroughLine(at(K(k), gBot), culet, tilted(K(k).n, p.pavilionAngle, -1)));
  for (const k of [1, 3, 5, 7]) planes.push(main.get(k)!);
  const level: FacetPlane = { normal: new THREE.Vector3(0, -1, 0), offset: -(gBot + p.lowerGirdleLength * (culet.y - gBot)) };
  for (const k of [0, 2, 4, 6, 8]) {
    const j = meet(main.get(k - 1)!, main.get(k + 1)!, level);
    if (k > 0) planes.push(planeFrom3(j, at(K(k - 1), gBot), at(K(k), gBot), inside));
    if (k < HALF_KEYS) planes.push(planeFrom3(j, at(K(k), gBot), at(K(k + 1), gBot), inside));
  }

  // Girdle: vertical facets along the outline.
  for (let i = 0; i <= GIRDLE_FACETS_PER_HALF; i++) {
    const s = alongHalf(half, i / GIRDLE_FACETS_PER_HALF);
    const normal = new THREE.Vector3(s.n.x, 0, s.n.z).normalize();
    planes.push({ normal, offset: normal.dot(new THREE.Vector3(s.p.x, 0, s.p.z)) });
  }
  planes.push({ normal: new THREE.Vector3(0, 0, -1), offset: 0 });
  return planes;
}

/** A heart of the given face-up length (point to lobes) and width. */
export function buildHeartCutSolid(length: number, width: number, p: HeartCutProportions = HEART_CUT): THREE.BufferGeometry {
  const upper = halfPlanes(length, width, p);
  const lower = upper.map((q) => ({ normal: new THREE.Vector3(q.normal.x, q.normal.y, -q.normal.z), offset: q.offset }));
  const hw = width / 2;
  return buildSplitSolid(
    [
      { planes: lower, inside: new THREE.Vector3(0, 0, -0.3 * hw) },
      { planes: upper, inside: new THREE.Vector3(0, 0, 0.3 * hw) },
    ],
    { normal: new THREE.Vector3(0, 0, 1), d: 0 },
    Math.max(length, width),
  );
}
