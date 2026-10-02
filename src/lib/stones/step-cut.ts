import * as THREE from "three";
import { buildFacetSolid, planeThrough, type FacetPlane } from "@/lib/stones/facet-solid";
import { cutCornerOutline } from "@/lib/stones/outline-shapes";
import { outlineExtents, type GirdleOutline } from "@/lib/stones/outlines";

/**
 * Step-cut generator (emerald, asscher).
 *
 * A step cut is rows of long facets parallel to the girdle — "steps" — above and below
 * it. Each outline edge gets one plane per tier; tiers get flatter toward the table on
 * the crown and flatter toward the keel on the pavilion, which is what keeps the stone
 * convex and gives the hall-of-mirrors flashes. The keel line (or a culet point on a
 * square) is not modelled explicitly: it is where the last pavilion tiers meet.
 */

export type StepCutProportions = {
  /** Table width as a fraction of the stone's width. */
  table: number;
  /** Crown tier angles in degrees, girdle → table (must decrease). */
  crownTiers: number[];
  /** Pavilion tier angles in degrees, girdle → keel (must decrease). */
  pavilionTiers: number[];
  /** Girdle thickness as a fraction of the stone's width. */
  girdle: number;
  /** Width of the flat culet polished across the keel, as a fraction of the width (0 = none). */
  culet?: number;
};

/** Three steps above and below, each a few degrees flatter than the last; table 61–69%, depth 61–67%. */
export const EMERALD_STEP_CUT: StepCutProportions = {
  table: 0.64,
  crownTiers: [40, 35, 30],
  pavilionTiers: [49, 44, 39],
  girdle: 0.035,
};

export const ASSCHER_STEP_CUT: StepCutProportions = {
  table: 0.6,
  crownTiers: [45, 36, 27],
  pavilionTiers: [52, 44, 36],
  girdle: 0.035,
};

type Edge = { a: THREE.Vector3; outward: THREE.Vector3 };

function outlineEdges(outline: GirdleOutline): Edge[] {
  const pts = outline.points;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    const outward = new THREE.Vector3(q.z - p.z, 0, -(q.x - p.x)).normalize();
    return { a: new THREE.Vector3(p.x, 0, p.z), outward };
  });
}

function tierPlanes(
  edges: Edge[],
  startY: number,
  runPerTier: number,
  angles: number[],
  vertical: 1 | -1,
): FacetPlane[] {
  const planes: FacetPlane[] = [];
  let inset = 0;
  let y = startY;
  for (const deg of angles) {
    const t = (deg * Math.PI) / 180;
    for (const edge of edges) {
      const normal = edge.outward.clone().multiplyScalar(Math.sin(t)).add(new THREE.Vector3(0, vertical * Math.cos(t), 0));
      const point = edge.a.clone().addScaledVector(edge.outward, -inset).setY(y);
      planes.push(planeThrough(normal, point));
    }
    inset += runPerTier;
    y += vertical * runPerTier * Math.tan(t);
  }
  return planes;
}

/**
 * Step-cut solid on a polygonal outline (usually `cutCornerOutline`). Girdle mid-plane is
 * y = 0, table up; closed, convex, flat-shaded and non-indexed.
 */
export function buildStepCutSolid(outline: GirdleOutline, p: StepCutProportions = EMERALD_STEP_CUT): THREE.BufferGeometry {
  const ext = outlineExtents(outline);
  const halfWidth = Math.min(ext.maxX - ext.minX, ext.maxZ - ext.minZ) / 2;
  const girdle = p.girdle * halfWidth * 2;
  const edges = outlineEdges(outline);

  const crownRun = ((1 - p.table) * halfWidth) / p.crownTiers.length;
  const crown = tierPlanes(edges, girdle / 2, crownRun, p.crownTiers, 1);
  const crownRise = p.crownTiers.reduce((h, deg) => h + crownRun * Math.tan((deg * Math.PI) / 180), 0);
  const table = planeThrough(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, girdle / 2 + crownRise, 0));

  const girdlePlanes = edges.map((e) => planeThrough(e.outward, e.a));
  const pavilionRun = halfWidth / p.pavilionTiers.length;
  const pavilion = tierPlanes(edges, -girdle / 2, pavilionRun, p.pavilionTiers, -1);
  const planes = [table, ...crown, ...girdlePlanes, ...pavilion];

  if (p.culet) {
    // The last tier meets the keel at the bottom; the culet flattens it `culet` wide.
    const keelY = p.pavilionTiers.reduce((y, deg) => y - pavilionRun * Math.tan((deg * Math.PI) / 180), -girdle / 2);
    const lastSlope = Math.tan((p.pavilionTiers[p.pavilionTiers.length - 1]! * Math.PI) / 180);
    planes.push({ normal: new THREE.Vector3(0, -1, 0), offset: -(keelY + p.culet * halfWidth * lastSlope) });
  }
  return buildFacetSolid(planes, halfWidth * 2);
}

/** Emerald-cut outline: rectangle with 45° corners. */
export function emeraldOutline(length: number, width: number, cornerFraction = 0.14): GirdleOutline {
  return cutCornerOutline(length, width, width * cornerFraction);
}

/** Asscher outline: square with large 45° corners. */
export function asscherOutline(size: number, cornerFraction = 0.2): GirdleOutline {
  return cutCornerOutline(size, size, size * cornerFraction);
}
