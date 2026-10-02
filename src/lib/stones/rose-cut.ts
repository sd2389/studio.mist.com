import * as THREE from "three";
import { buildFacetSolid, planeFromPoints, planeThrough, type FacetPlane } from "@/lib/stones/facet-solid";

/**
 * Rose cut (full Dutch / Holland rose): a flat base under a dome of 24 triangular facets
 * in six-fold symmetry, no table and no pavilion.
 *
 *   crown  6 star facets meeting at the apex
 *          6 cross facets hanging point-down from the star ring to the girdle
 *          12 teeth standing on the girdle between them          = 24 facets
 *   base   1 flat facet                                           = 25 with the base
 *
 * The girdle is the 12-gon the teeth stand on (a thin band, so a setting has an edge to
 * hold). Frame: girdle mid-plane y = 0, apex toward +y, units of the caller.
 */

export type RoseCutProportions = {
  /** Total height (base to apex) as a fraction of the diameter. The Dutch rose is ½. */
  height: number;
  /** Radius of the star ring (where star and cross facets meet), fraction of the girdle radius. */
  starRing: number;
  /** Height of the star ring above the girdle, as a fraction of the crown height. */
  starRingHeight: number;
  /** Girdle thickness as a fraction of the diameter. */
  girdle: number;
};

const SIXTH = Math.PI / 3;

export function buildRoseCutSolid(diameter: number, p: RoseCutProportions): THREE.BufferGeometry {
  const r = diameter / 2;
  const g = p.girdle * diameter;
  const crown = p.height * diameter - g;
  const top = g / 2;
  const apex = new THREE.Vector3(0, top + crown, 0);
  const ring = (i: number, radius: number, y: number, phase = 0) =>
    new THREE.Vector3(Math.cos(i * SIXTH + phase) * radius, y, Math.sin(i * SIXTH + phase) * radius);
  const star = (i: number) => ring(i, r * p.starRing, top + crown * p.starRingHeight);
  const girdleOn = (i: number) => ring(i, r, top); // under a star-ring corner
  const girdleBetween = (i: number) => ring(i, r, top, SIXTH / 2); // under a cross facet's point

  const planes: FacetPlane[] = [];
  for (let i = 0; i < 6; i++) {
    planes.push(planeFromPoints(apex, star(i), star(i + 1)));
    planes.push(planeFromPoints(star(i), star(i + 1), girdleBetween(i)));
    planes.push(planeFromPoints(star(i), girdleBetween(i - 1), girdleOn(i)));
    planes.push(planeFromPoints(star(i), girdleOn(i), girdleBetween(i)));
  }
  // Girdle band: one vertical facet per 12-gon side, then the flat base.
  for (let i = 0; i < 12; i++) {
    const a = (i + 0.5) * (SIXTH / 2);
    planes.push(planeThrough(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(r * Math.cos(SIXTH / 4))));
  }
  planes.push({ normal: new THREE.Vector3(0, -1, 0), offset: g / 2 });
  return buildFacetSolid(planes, diameter);
}
