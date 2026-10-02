/**
 * Planar-facet signals for a closed island. A cut stone is a handful of large flat facets
 * tilted around its table; tessellated metal is many tiny facets, and a tessellated cylinder
 * or prism has its facets only parallel or perpendicular to one axis.
 */

/** A facet counts as "large" when it covers at least this share of the island surface. */
const MIN_FACET_SHARE = 0.005;
const FACET_NORMAL_COS = Math.cos((1.5 * Math.PI) / 180);
/** Coplanarity tolerance as a fraction of the island's bounding diagonal. */
const FACET_PLANE_TOLERANCE = 2e-3;
const MAX_TRACKED_FACETS = 256;
/** Facets tilted 15°–75° from the largest facet's normal count as "inclined" (crown, pavilion). */
const INCLINED_COS_MIN = Math.cos((75 * Math.PI) / 180);
const INCLINED_COS_MAX = Math.cos((15 * Math.PI) / 180);

export type FacetInput = {
  /** Island-local positions (xyz). */
  positions: ArrayLike<number>;
  /** Three local vertex ids per triangle. */
  corners: ArrayLike<number>;
  /** Unit normal per triangle (xyz). */
  normals: ArrayLike<number>;
  areas: ArrayLike<number>;
  area: number;
  diagonal: number;
};

export type FacetSignals = {
  /** Planar facets that each cover at least 0.5 % of the surface. */
  facetCount: number;
  /** Share of the surface lying in those facets. */
  planarRatio: number;
  /** Share of the surface in large facets inclined against the largest facet (the table). */
  inclinedShare: number;
};

type Facet = { nx: number; ny: number; nz: number; d: number; area: number };

function clusterPlanes(input: FacetInput, giveUpArea: number): Facet[] {
  const planeTolerance = input.diagonal * FACET_PLANE_TOLERANCE;
  const triangleCount = input.areas.length;
  const order = new Uint32Array(triangleCount).map((_, i) => i).sort((a, b) => input.areas[b] - input.areas[a]);
  const facets: Facet[] = [];
  let unassigned = 0;
  for (const t of order) {
    const area = input.areas[t];
    if (area <= 0) continue;
    const nx = input.normals[t * 3], ny = input.normals[t * 3 + 1], nz = input.normals[t * 3 + 2];
    const a = input.corners[t * 3] * 3;
    const d = nx * input.positions[a] + ny * input.positions[a + 1] + nz * input.positions[a + 2];
    const facet = facets.find((f) =>
      f.nx * nx + f.ny * ny + f.nz * nz >= FACET_NORMAL_COS && Math.abs(f.d - d) <= planeTolerance);
    if (facet) facet.area += area;
    else if (facets.length < MAX_TRACKED_FACETS) facets.push({ nx, ny, nz, d, area });
    else unassigned += area;
    // Smooth metal: too much area left over for the island to ever read as faceted.
    if (unassigned > giveUpArea) break;
  }
  return facets;
}

/** Greedy plane clustering, largest triangles first. */
export function measurePlanarFacets(input: FacetInput, giveUpShare = 0.3): FacetSignals {
  const facets = clusterPlanes(input, input.area * giveUpShare);
  const minArea = input.area * MIN_FACET_SHARE;
  const large = facets.filter((facet) => facet.area >= minArea).sort((a, b) => b.area - a.area);
  if (large.length === 0 || input.area <= 0) return { facetCount: 0, planarRatio: 0, inclinedShare: 0 };
  const axis = large[0];
  let largeArea = 0;
  let inclinedArea = 0;
  for (const facet of large) {
    largeArea += facet.area;
    const cos = Math.abs(facet.nx * axis.nx + facet.ny * axis.ny + facet.nz * axis.nz);
    if (cos >= INCLINED_COS_MIN && cos <= INCLINED_COS_MAX) inclinedArea += facet.area;
  }
  return {
    facetCount: large.length,
    planarRatio: largeArea / input.area,
    inclinedShare: inclinedArea / input.area,
  };
}
