import * as THREE from "three";
import { buildFacetSolid, type FacetPlane } from "@/lib/stones/facet-solid";

/**
 * Chevron cuts: the princess (a square modified brilliant with pointed corners) and the
 * radiant (the same idea on a cut-cornered rectangle). Their pavilions are cut in chevrons —
 * fans of facets hinged at the ends of each straight side of the girdle — which is what
 * draws the cross and nested outlines face-up; the crown is two steps.
 *
 * On each side, the fans from its two ends meet on the side's centre line as chevrons
 * pointing at the culet. Each fan's last facet, the corner main, runs from the girdle to a
 * point culet; every other tier is set so the chevrons step evenly from the girdle to the
 * culet along that centre line.
 */

export type ChevronCutProportions = {
  /** Table width over stone width. */
  table: number;
  /** Crown steps from the girdle in, degrees. */
  crownAngles: readonly [number, number];
  /** Share of the crown's run taken by the girdle step. */
  crownBreak: number;
  /** Girdle to culet, over the width. */
  pavilionDepth: number;
  /** The corner mains sit this far inside the line from their hinge to the stone's corner, degrees. */
  mainOffset: number;
  /** Azimuths of the chevron pairs, off each side's normal toward its ends, degrees. */
  chevrons: readonly number[];
  girdle: number;
  /** Leg of each 45° corner cut, over the width; 0 leaves pointed corners. */
  corner: number;
};

export const PRINCESS_CUT: ChevronCutProportions = {
  table: 0.68,
  crownAngles: [38, 26],
  crownBreak: 0.55,
  // Ridges from the corners to the culet at about 40°, as a princess's corner mains want.
  pavilionDepth: 0.6,
  mainOffset: 15,
  chevrons: [7.5, 15, 22.5],
  girdle: 0.025,
  corner: 0,
};

export const RADIANT_CUT: ChevronCutProportions = {
  table: 0.66,
  crownAngles: [38, 27],
  crownBreak: 0.5,
  pavilionDepth: 0.52,
  mainOffset: 12,
  chevrons: [8, 16, 24],
  girdle: 0.025,
  corner: 0.14,
};

const D2R = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/** Plane with normal `n` through point `p`. */
function through(n: THREE.Vector3, p: THREE.Vector3): FacetPlane {
  const normal = n.clone().normalize();
  return { normal, offset: normal.dot(p) };
}

/** Normal tilted `deg` from vertical toward horizontal direction `h`: up for the crown, down for the pavilion. */
function tilt(h: THREE.Vector3, deg: number, vertical: 1 | -1): THREE.Vector3 {
  return h.clone().multiplyScalar(Math.sin(deg * D2R)).addScaledVector(UP, vertical * Math.cos(deg * D2R));
}

type Side = {
  /** Outward normal of the side (horizontal, unit). */
  e: THREE.Vector3;
  /** Along the side (horizontal, unit). */
  t: THREE.Vector3;
  /** Centre to side. */
  reach: number;
  /** Side centre to either end of its straight girdle edge, where its fans hinge. */
  half: number;
  /** Side centre to the stone's corner (the end, had it not been cut). */
  cornerHalf: number;
};

/** One side's pavilion: its own facet, then a fan hinged at each end. Returns the side facet's angle too. */
function sidePavilion(side: Side, p: ChevronCutProportions, girdleBottom: number, depth: number): { planes: FacetPlane[]; sideAngle: number } {
  const { e, t, reach: D, half: E } = side;
  // Where a facet at azimuth δ (off e, toward an end) hinged at that end crosses the side's
  // centre line, at distance s from the centre: y = gBot − tanθ (E sinδ + (D − s) cosδ).
  const run = (deg: number, s: number) => E * Math.sin(deg * D2R) + (D - s) * Math.cos(deg * D2R);
  const main = Math.atan2(side.cornerHalf, D) / D2R - p.mainOffset;
  const tiers = [...p.chevrons, main];
  const slopes = new Array<number>(tiers.length);
  slopes[tiers.length - 1] = depth / run(main, 0);
  // Chevron breaks evenly spaced along the centre line, from the girdle to the culet.
  const breaks = tiers.map((_, k) => D * (1 - (k + 1) / (tiers.length + 1)));
  for (let k = tiers.length - 2; k >= 0; k--) {
    const s = breaks[k + 1]!;
    slopes[k] = (slopes[k + 1]! * run(tiers[k + 1]!, s)) / run(tiers[k]!, s);
  }
  const sideAngle = Math.atan((slopes[0]! * run(tiers[0]!, breaks[0]!)) / (D - breaks[0]!)) / D2R;

  const planes = [through(tilt(e, sideAngle, -1), e.clone().multiplyScalar(D).setY(girdleBottom))];
  for (const sign of [1, -1]) {
    const end = e.clone().multiplyScalar(D).addScaledVector(t, sign * E).setY(girdleBottom);
    tiers.forEach((deg, k) => {
      const h = e.clone().multiplyScalar(Math.cos(deg * D2R)).addScaledVector(t, sign * Math.sin(deg * D2R));
      planes.push(through(tilt(h, Math.atan(slopes[k]!) / D2R, -1), end));
    });
  }
  return { planes, sideAngle };
}

/** A chevron cut of the given face-up length and width (both across the sides). */
export function buildChevronCutSolid(length: number, width: number, p: ChevronCutProportions): THREE.BufferGeometry {
  const a = length / 2, b = width / 2;
  const c = p.corner * width;
  const g = p.girdle * width;
  const gTop = g / 2, gBot = -g / 2;
  const sides: Side[] = [
    { e: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, 0, 1), reach: a, half: b - c, cornerHalf: b },
    { e: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(-1, 0, 0), reach: b, half: a - c, cornerHalf: a },
    { e: new THREE.Vector3(-1, 0, 0), t: new THREE.Vector3(0, 0, -1), reach: a, half: b - c, cornerHalf: b },
    { e: new THREE.Vector3(0, 0, -1), t: new THREE.Vector3(1, 0, 0), reach: b, half: a - c, cornerHalf: a },
  ];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const;
  const depth = p.pavilionDepth * width;

  // Crown: the same run on every side, so the table keeps the girdle's proportions.
  const crownRun = b * (1 - p.table);
  const [outer, inner] = p.crownAngles;
  const breakIn = crownRun * p.crownBreak;
  const breakY = gTop + breakIn * Math.tan(outer * D2R);
  const tableY = breakY + (crownRun - breakIn) * Math.tan(inner * D2R);
  /** Girdle facet, both crown steps and (given its angle) the pavilion facet of one straight edge. */
  const edgePlanes = (e: THREE.Vector3, reach: number, pavilionAngle?: number): FacetPlane[] => [
    { normal: e.clone(), offset: reach },
    through(tilt(e, outer, 1), e.clone().multiplyScalar(reach).setY(gTop)),
    through(tilt(e, inner, 1), e.clone().multiplyScalar(reach - breakIn).setY(breakY)),
    ...(pavilionAngle === undefined ? [] : [through(tilt(e, pavilionAngle, -1), e.clone().multiplyScalar(reach).setY(gBot))]),
  ];

  const planes: FacetPlane[] = [{ normal: UP.clone(), offset: tableY }];
  const sideAngles: number[] = [];
  for (const side of sides) {
    planes.push(...edgePlanes(side.e, side.reach));
    const pavilion = sidePavilion(side, p, gBot, depth);
    planes.push(...pavilion.planes);
    sideAngles.push(pavilion.sideAngle);
  }
  corners.forEach(([sx, sz], k) => {
    if (c > 0) {
      // A cut corner is one more straight edge, at the steepness of the sides it joins.
      const e = new THREE.Vector3(sx, 0, sz).normalize();
      const reach = e.dot(new THREE.Vector3(sx * a, 0, sz * (b - c)));
      planes.push(...edgePlanes(e, reach, (sideAngles[k]! + sideAngles[(k + 1) % 4]!) / 2));
      return;
    }
    // A pointed corner gets a kite, from the girdle corner up to the table's, square to the diagonal.
    const corner = new THREE.Vector3(sx * a, gTop, sz * b);
    const tableCorner = new THREE.Vector3(sx * (a - crownRun), tableY, sz * (b - crownRun));
    const normal = tableCorner.clone().sub(corner).cross(new THREE.Vector3(-sz, 0, sx)).normalize();
    if (normal.y < 0) normal.negate();
    planes.push({ normal, offset: normal.dot(corner) });
  });
  return buildFacetSolid(planes, Math.max(length, width));
}
