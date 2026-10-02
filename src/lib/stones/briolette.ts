import * as THREE from "three";
import { convexHullGeometry } from "@/lib/stones/facet-solid";
import { convexHull2D, type GirdleOutline } from "@/lib/stones/outlines";

/**
 * Briolette: a faceted teardrop with no table, girdle or culet — triangular facets all
 * the way round. Vertices sit on staggered rings around the long axis (each ring turned
 * half a step against the last), so the hull between two rings is a band of alternating
 * up- and down-pointing triangles, closed by a fan at the rounded base and one at the tip.
 *
 * Facets: `sides` × 2 per band between rings, plus `sides` in each end fan, so
 * 2 × sides × rings in all (10 sides, 5 rings: 100).
 *
 * Frame: long axis on x with the tip at +x, so it lies like the other elongated cuts;
 * the widest section is the y = 0 plane, which the rings are mirror-symmetric about.
 */

export type BrioletteProportions = {
  /**
   * Facets around each ring. Even, so alternate rings have a vertex on ±z: the widest
   * section then passes through ring vertices and the outline a setting grips is exact.
   */
  sides: number;
  /** Ring positions along the length, 0 at the base to 1 at the tip. */
  rings: number[];
  /** Widest point, as a fraction of the length from the base. */
  shoulder: number;
};

/** Teardrop profile radius (0..1) at `u` along the length: an elliptical base, a convex taper to the point. */
export function brioletteProfile(u: number, shoulder: number): number {
  if (u <= shoulder) {
    const t = (shoulder - u) / shoulder;
    return Math.sqrt(Math.max(0, 1 - t * t));
  }
  return Math.cos(((u - shoulder) / (1 - shoulder)) * (Math.PI / 2));
}

export function buildBrioletteSolid(length: number, width: number, p: BrioletteProportions): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [new THREE.Vector3(-length / 2, 0, 0), new THREE.Vector3(length / 2, 0, 0)];
  p.rings.forEach((u, ring) => {
    const radius = (width / 2) * brioletteProfile(u, p.shoulder);
    const x = -length / 2 + u * length;
    for (let k = 0; k < p.sides; k++) {
      // Angle around the axis from +y; alternate rings are offset half a facet.
      const psi = ((k + (ring % 2) * 0.5) / p.sides) * Math.PI * 2;
      points.push(new THREE.Vector3(x, Math.cos(psi) * radius, Math.sin(psi) * radius));
    }
  });
  return convexHullGeometry(points);
}

/** The silhouette a setting grips: the teardrop profile in the y = 0 plane, tip on +x. */
export function brioletteOutline(length: number, width: number, shoulder: number, samples = 48): GirdleOutline {
  const side = Array.from({ length: samples + 1 }, (_, i) => {
    const u = i / samples;
    return { x: -length / 2 + u * length, z: (width / 2) * brioletteProfile(u, shoulder) };
  });
  const points = convexHull2D([...side, ...side.map((p) => ({ x: p.x, z: -p.z }))]);
  const tip = points.reduce((best, p, i) => (p.x > points[best]!.x ? i : best), 0);
  return { points, corners: [tip] };
}
