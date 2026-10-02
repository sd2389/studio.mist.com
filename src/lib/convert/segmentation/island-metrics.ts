import { Vector3 } from "three";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import { measurePlanarFacets } from "./planar-facets";
import { principalExtents } from "./principal-extents";

/**
 * Shape signals for one connected island, used to tell cut stones from metal:
 * stones are closed, convex, compact solids covered by a handful of large planar facets;
 * metal is smooth (many tiny facets), usually non-convex, or rod-like (prongs, wire).
 */

/** Islands above this are structural metal; skipping their analysis keeps pavé rings fast. */
export const MAX_ANALYSED_TRIANGLES = 50_000;

/** Share of boundary edges tolerated before an island counts as open (export cracks). */
const MAX_OPEN_EDGE_SHARE = 0.01;
const MIN_GEM_FACETS = 8;
const MIN_GEM_PLANAR_RATIO = 0.7;
/** Crown and pavilion facets tilt against the table; prism and cylinder facets do not. */
const MIN_GEM_INCLINED_SHARE = 0.35;
/** Spheres (beads, coarse or fine) are ~0.9+; brilliants and octahedra ~0.6. */
const MAX_GEM_SPHERICITY = 0.8;
const MIN_GEM_CONVEXITY = 0.9;

export type IslandMetrics = {
  triangleCount: number;
  area: number;
  /** Enclosed volume (0 when the island is open). */
  volume: number;
  /** Axis-aligned bounding-box volume — the legacy size signal, kept for metal ranking. */
  boxVolume: number;
  isClosed: boolean;
  /** Planar facets that each cover at least 0.5 % of the surface. */
  facetCount: number;
  /** Share of the surface lying in those facets. */
  planarRatio: number;
  /** Share of the surface in large facets tilted 15°–75° from the largest facet. */
  inclinedShare: number;
  /** Isoperimetric quotient 36πV²/A³: 1 for a sphere, ~0.6 for a brilliant or octahedron. */
  sphericity: number;
  /** Long, straight, round-section island (prong, wire, peg). */
  isRod: boolean;
  /** Volume ÷ convex-hull volume; null when a cheaper signal already ruled the island out. */
  convexity: number | null;
};

type LocalIsland = {
  /** Positions relative to the island centroid (Float64 for stable volume sums). */
  positions: Float64Array;
  corners: Uint32Array;
  vertexCount: number;
  triangleCount: number;
};

function extractLocalIsland(
  positions: ArrayLike<number>,
  corners: ArrayLike<number>,
  triangleIds: ArrayLike<number>,
): LocalIsland {
  const localOf = new Map<number, number>();
  const localCorners = new Uint32Array(triangleIds.length * 3);
  const gathered: number[] = [];
  for (let i = 0; i < triangleIds.length; i++) {
    for (let k = 0; k < 3; k++) {
      const id = corners[triangleIds[i] * 3 + k];
      let local = localOf.get(id);
      if (local === undefined) {
        local = localOf.size;
        localOf.set(id, local);
        gathered.push(positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2]);
      }
      localCorners[i * 3 + k] = local;
    }
  }
  const vertexCount = localOf.size;
  const local = Float64Array.from(gathered);
  const centroid = [0, 0, 0];
  for (let v = 0; v < vertexCount; v++) {
    for (let axis = 0; axis < 3; axis++) centroid[axis] += local[v * 3 + axis] / vertexCount;
  }
  for (let v = 0; v < vertexCount; v++) {
    for (let axis = 0; axis < 3; axis++) local[v * 3 + axis] -= centroid[axis];
  }
  return { positions: local, corners: localCorners, vertexCount, triangleCount: triangleIds.length };
}

/** Axis-aligned box volume straight from the welded positions (works for any island size). */
function islandBoxVolume(
  positions: ArrayLike<number>,
  corners: ArrayLike<number>,
  triangleIds: ArrayLike<number>,
): number {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < triangleIds.length; i++) {
    for (let k = 0; k < 3; k++) {
      const id = corners[triangleIds[i] * 3 + k];
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[id * 3 + axis];
        if (value < min[axis]) min[axis] = value;
        if (value > max[axis]) max[axis] = value;
      }
    }
  }
  return Math.max((max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]), 1e-18);
}

type TriangleFrame = { normals: Float64Array; areas: Float64Array; area: number; volume: number };

function triangleFrame(island: LocalIsland): TriangleFrame {
  const { positions: p, corners, triangleCount } = island;
  const normals = new Float64Array(triangleCount * 3);
  const areas = new Float64Array(triangleCount);
  let area = 0;
  let volume = 0;
  for (let t = 0; t < triangleCount; t++) {
    const a = corners[t * 3] * 3, b = corners[t * 3 + 1] * 3, c = corners[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    areas[t] = length / 2;
    area += length / 2;
    if (length > 0) {
      normals[t * 3] = nx / length;
      normals[t * 3 + 1] = ny / length;
      normals[t * 3 + 2] = nz / length;
    }
    // a · ((b − a) × (c − a)) equals a · (b × c): six times the signed tetra volume.
    volume += (p[a] * nx + p[a + 1] * ny + p[a + 2] * nz) / 6;
  }
  return { normals, areas, area, volume: Math.abs(volume) };
}

function isClosedSurface(island: LocalIsland): boolean {
  const useCount = new Map<number, number>();
  const n = island.vertexCount;
  for (let t = 0; t < island.triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      const a = island.corners[t * 3 + k];
      const b = island.corners[t * 3 + ((k + 1) % 3)];
      const key = a < b ? a * n + b : b * n + a;
      useCount.set(key, (useCount.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const count of useCount.values()) if (count !== 2) open += 1;
  return useCount.size > 0 && open <= useCount.size * MAX_OPEN_EDGE_SHARE;
}

function diagonalOf(island: LocalIsland): number {
  let radius = 0;
  for (let v = 0; v < island.vertexCount; v++) {
    const p = island.positions;
    radius = Math.max(radius, Math.hypot(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]));
  }
  return 2 * radius;
}

function isRodShaped(island: LocalIsland): boolean {
  const [long, mid, short] = principalExtents(island.positions, island.vertexCount);
  return long >= 2.5 * mid && mid <= 1.25 * short;
}

function convexityOf(island: LocalIsland, volume: number): number {
  const points: Vector3[] = [];
  for (let v = 0; v < island.vertexCount; v++) {
    points.push(new Vector3(island.positions[v * 3], island.positions[v * 3 + 1], island.positions[v * 3 + 2]));
  }
  try {
    const hull = new ConvexHull().setFromPoints(points);
    // Points are centred, so each face's plane constant is its distance from an inside origin.
    const hullVolume = hull.faces.reduce((sum, face) => sum + (face.area * face.constant) / 3, 0);
    return hullVolume > 0 ? Math.min(volume / hullVolume, 1) : 0;
  } catch {
    return 0;
  }
}

/** Closed, compact, not a rod, and covered by large inclined planar facets. */
function looksFaceted(m: IslandMetrics): boolean {
  return m.isClosed && !m.isRod && m.facetCount >= MIN_GEM_FACETS &&
    m.planarRatio >= MIN_GEM_PLANAR_RATIO && m.inclinedShare >= MIN_GEM_INCLINED_SHARE &&
    m.sphericity <= MAX_GEM_SPHERICITY;
}

/** A cut stone: closed, convex, compact, with few large planar facets. */
export function isGemShaped(m: IslandMetrics): boolean {
  return looksFaceted(m) && (m.convexity ?? 0) >= MIN_GEM_CONVEXITY;
}

/** Every signal is computed only while the island still looks like a stone. */
export function measureIsland(
  positions: ArrayLike<number>,
  corners: ArrayLike<number>,
  triangleIds: ArrayLike<number>,
): IslandMetrics {
  const metrics: IslandMetrics = {
    triangleCount: triangleIds.length, area: 0, volume: 0,
    boxVolume: islandBoxVolume(positions, corners, triangleIds), isClosed: false,
    facetCount: 0, planarRatio: 0, inclinedShare: 0, sphericity: 0, isRod: false, convexity: null,
  };
  if (triangleIds.length < 4 || triangleIds.length > MAX_ANALYSED_TRIANGLES) return metrics;

  const island = extractLocalIsland(positions, corners, triangleIds);
  const frame = triangleFrame(island);
  metrics.area = frame.area;
  metrics.isClosed = isClosedSurface(island);
  if (!metrics.isClosed || frame.volume <= 0) return metrics;

  metrics.volume = frame.volume;
  metrics.sphericity = (36 * Math.PI * frame.volume ** 2) / frame.area ** 3;
  metrics.isRod = isRodShaped(island);
  Object.assign(metrics, measurePlanarFacets({
    positions: island.positions, corners: island.corners, normals: frame.normals,
    areas: frame.areas, area: frame.area, diagonal: diagonalOf(island),
  }, 1 - MIN_GEM_PLANAR_RATIO));
  if (looksFaceted(metrics)) metrics.convexity = convexityOf(island, frame.volume);
  return metrics;
}
