import type * as THREE from "three";

/**
 * Facet-plane extraction for the ray-traced gem shader.
 *
 * A cut stone is a convex polyhedron, so the exit point of any ray travelling inside it is
 * found exactly by intersecting the ray with the stone's facet planes and taking the
 * nearest one ahead. That turns "trace light bouncing inside a diamond" into a short loop
 * over a few dozen planes per bounce — no BVH, no screen-space tricks, and every internal
 * reflection, total internal reflection and dispersed exit is geometrically real.
 *
 * One mesh may carry many stones (pavé is usually merged into a single slot), so the
 * geometry is first split into connected islands and each island gets its own plane set.
 */

/** Planes per stone; the atlas row holds one header texel plus the planes. */
export const MAX_GEM_PLANES = 127;
export const GEM_ATLAS_ROW_TEXELS = MAX_GEM_PLANES + 1;

/** A stone with fewer planes than this cannot be closed and is left untraced. */
const MIN_TRACE_PLANES = 4;

/** Normal-merge tolerances tried in order until the facet count fits the atlas row. */
const MERGE_TOLERANCES_DEG = [0.5, 1, 2, 4, 7, 11, 16, 24];

export type GemStonePlanes = {
  /** (nx, ny, nz, d) per plane in geometry space; a point p is inside when n·p ≤ d. */
  planes: Float32Array;
  planeCount: number;
  /** Largest centre-to-vertex distance. Absorption is expressed relative to it so a
   *  stone's colour depth does not depend on the model's unit scale. */
  radius: number;
  /**
   * A stone that is not convex (a heart, with its cleft) is traced as two convex pieces
   * meeting on a split plane: `splitPlane` is that plane's 1-based index in `planes`, and
   * `partner` the other piece's stone index. A ray reaching the split plane is still inside
   * the stone, so the shader carries it straight on into the partner.
   */
  partner?: number;
  splitPlane?: number;
};

export type GemTraceTable = {
  stones: GemStonePlanes[];
  /** Stone index for every vertex, in the geometry's vertex order. */
  stoneOfVertex: Float32Array;
};

type FacetNormal = { x: number; y: number; z: number; area: number };

function vertexIndexOf(index: ArrayLike<number> | null, corner: number): number {
  return index ? index[corner]! : corner;
}

/** Union-find over welded vertex positions: vertices of one island share a root. */
function findRoot(parent: Int32Array, i: number): number {
  let root = i;
  while (parent[root] !== root) root = parent[root]!;
  while (parent[i] !== root) {
    const next = parent[i]!;
    parent[i] = root;
    i = next;
  }
  return root;
}

function weldVertices(position: ArrayLike<number>, vertexCount: number, tolerance: number): Int32Array {
  const weldId = new Int32Array(vertexCount);
  const idByKey = new Map<string, number>();
  const inv = 1 / tolerance;
  for (let v = 0; v < vertexCount; v++) {
    const key = `${Math.round(position[v * 3]! * inv)},${Math.round(position[v * 3 + 1]! * inv)},${Math.round(position[v * 3 + 2]! * inv)}`;
    let id = idByKey.get(key);
    if (id === undefined) {
      id = idByKey.size;
      idByKey.set(key, id);
    }
    weldId[v] = id;
  }
  return weldId;
}

function boundingSize(position: ArrayLike<number>, vertexCount: number): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let v = 0; v < vertexCount; v++) {
    const x = position[v * 3]!, y = position[v * 3 + 1]!, z = position[v * 3 + 2]!;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-9);
}

/** Island index per vertex, connecting triangles that share a (welded) corner. */
export function labelGemIslands(
  position: ArrayLike<number>,
  index: ArrayLike<number> | null,
  vertexCount: number,
): { islandOfVertex: Int32Array; islandCount: number; weldId: Int32Array } {
  const weldId = weldVertices(position, vertexCount, boundingSize(position, vertexCount) * 1e-5);
  let weldCount = 0;
  for (let v = 0; v < vertexCount; v++) weldCount = Math.max(weldCount, weldId[v]! + 1);
  const parent = new Int32Array(weldCount);
  for (let i = 0; i < weldCount; i++) parent[i] = i;

  const cornerCount = index ? index.length : vertexCount;
  for (let c = 0; c + 2 < cornerCount; c += 3) {
    const a = findRoot(parent, weldId[vertexIndexOf(index, c)]!);
    const b = findRoot(parent, weldId[vertexIndexOf(index, c + 1)]!);
    const d = findRoot(parent, weldId[vertexIndexOf(index, c + 2)]!);
    parent[b] = a;
    parent[d] = a;
  }

  const islandOfRoot = new Map<number, number>();
  const islandOfVertex = new Int32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const root = findRoot(parent, weldId[v]!);
    let island = islandOfRoot.get(root);
    if (island === undefined) {
      island = islandOfRoot.size;
      islandOfRoot.set(root, island);
    }
    islandOfVertex[v] = island;
  }
  return { islandOfVertex, islandCount: islandOfRoot.size, weldId };
}

/** Greedy area-weighted clustering of triangle normals within an angular tolerance. */
function clusterNormals(facets: FacetNormal[], toleranceDeg: number): FacetNormal[] {
  const cosTol = Math.cos((toleranceDeg * Math.PI) / 180);
  const clusters: FacetNormal[] = [];
  for (const f of facets) {
    let merged = false;
    for (const c of clusters) {
      const len = Math.hypot(c.x, c.y, c.z);
      if ((c.x * f.x + c.y * f.y + c.z * f.z) / len >= cosTol) {
        c.x += f.x * f.area;
        c.y += f.y * f.area;
        c.z += f.z * f.area;
        c.area += f.area;
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push({ x: f.x * f.area, y: f.y * f.area, z: f.z * f.area, area: f.area });
  }
  return clusters;
}

function clusterWithinBudget(facets: FacetNormal[], budget = MAX_GEM_PLANES): FacetNormal[] {
  let clusters: FacetNormal[] = [];
  for (const tolerance of MERGE_TOLERANCES_DEG) {
    clusters = clusterNormals(facets, tolerance);
    if (clusters.length <= budget) return clusters;
  }
  // Still over budget (a very smooth cabochon): keep the largest facets, which dominate
  // what the eye reads, and let the hull close slightly coarser.
  return clusters.sort((a, b) => b.area - a.area).slice(0, budget);
}

/**
 * Convex plane set bounding one island. Each plane is pushed out to the farthest vertex
 * along its normal, so the polytope always contains the stone: exact for convex cuts,
 * the convex hull's faceting for anything else.
 */
export function extractStonePlanes(islandPositions: Float32Array, facets: FacetNormal[], budget = MAX_GEM_PLANES): GemStonePlanes {
  const vertexCount = islandPositions.length / 3;
  // Bounding-box centre: non-indexed meshes repeat shared corners, which skews a vertex average.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let v = 0; v < vertexCount; v++) {
    const x = islandPositions[v * 3]!, y = islandPositions[v * 3 + 1]!, z = islandPositions[v * 3 + 2]!;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;

  let radius = 0;
  for (let v = 0; v < vertexCount; v++) {
    radius = Math.max(radius, Math.hypot(islandPositions[v * 3]! - cx, islandPositions[v * 3 + 1]! - cy, islandPositions[v * 3 + 2]! - cz));
  }

  const clusters = clusterWithinBudget(facets, budget);
  if (clusters.length < MIN_TRACE_PLANES) return { planes: new Float32Array(0), planeCount: 0, radius };

  const planes = new Float32Array(clusters.length * 4);
  clusters.forEach((c, i) => {
    const len = Math.hypot(c.x, c.y, c.z) || 1;
    const nx = c.x / len, ny = c.y / len, nz = c.z / len;
    let d = -Infinity;
    for (let v = 0; v < vertexCount; v++) {
      d = Math.max(d, nx * islandPositions[v * 3]! + ny * islandPositions[v * 3 + 1]! + nz * islandPositions[v * 3 + 2]!);
    }
    planes.set([nx, ny, nz, d], i * 4);
  });
  return { planes, planeCount: clusters.length, radius };
}

function triangleNormal(position: ArrayLike<number>, a: number, b: number, c: number): FacetNormal | null {
  const ax = position[a * 3]!, ay = position[a * 3 + 1]!, az = position[a * 3 + 2]!;
  const e1x = position[b * 3]! - ax, e1y = position[b * 3 + 1]! - ay, e1z = position[b * 3 + 2]! - az;
  const e2x = position[c * 3]! - ax, e2y = position[c * 3 + 1]! - ay, e2z = position[c * 3 + 2]! - az;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-20) return null;
  return { x: nx / len, y: ny / len, z: nz / len, area: len * 0.5 };
}

type SplitPlane = { nx: number; ny: number; nz: number; d: number };

/**
 * The plane a stone folds in on, or null when it is convex. A two-piece stone (a heart) is
 * concave only along its cleft, and every one of those reflex edges lies in the plane
 * between the pieces — so the split is read from the geometry itself, and survives any
 * transform or merge the mesh goes through on its way into a ring.
 */
function reflexSplitPlane(position: ArrayLike<number>, triangles: number[], weldId: Int32Array, size: number): SplitPlane | null {
  const tolerance = size * 1e-4;
  const at = (v: number, k: number) => position[v * 3 + k]!;
  const edges = new Map<string, number[]>();
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = weldId[triangles[t + k]!]!, b = weldId[triangles[t + ((k + 1) % 3)]!]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const list = edges.get(key);
      // Triangle start and the corner opposite the edge.
      if (list) list.push(t, triangles[t + ((k + 2) % 3)]!);
      else edges.set(key, [t, triangles[t + ((k + 2) % 3)]!]);
    }
  }
  const reflex: { a: number; b: number }[] = [];
  for (const list of edges.values()) {
    if (list.length !== 4) continue;
    const t = list[0]!, opposite = list[3]!;
    const n = triangleNormal(position, triangles[t]!, triangles[t + 1]!, triangles[t + 2]!);
    if (!n) continue;
    const a = triangles[t]!;
    const rise = n.x * (at(opposite, 0) - at(a, 0)) + n.y * (at(opposite, 1) - at(a, 1)) + n.z * (at(opposite, 2) - at(a, 2));
    if (rise <= tolerance) continue;
    // The shared edge's two corners in the first triangle: the ones that are not opposite it.
    const corners = [triangles[t]!, triangles[t + 1]!, triangles[t + 2]!].filter((v) => v !== list[1]);
    if (corners.length === 2) reflex.push({ a: corners[0]!, b: corners[1]! });
  }
  if (reflex.length < 2) return null;

  // Normal from the two least parallel reflex edges, then every reflex corner must lie on it.
  const direction = ({ a, b }: { a: number; b: number }) => {
    const x = at(b, 0) - at(a, 0), y = at(b, 1) - at(a, 1), z = at(b, 2) - at(a, 2);
    const len = Math.hypot(x, y, z) || 1;
    return [x / len, y / len, z / len] as const;
  };
  let best = 0, nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < reflex.length; i++) {
    const [ax, ay, az] = direction(reflex[i]!);
    for (let j = i + 1; j < reflex.length; j++) {
      const [bx, by, bz] = direction(reflex[j]!);
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      const len = Math.hypot(cx, cy, cz);
      if (len > best) {
        best = len;
        nx = cx / len; ny = cy / len; nz = cz / len;
      }
    }
  }
  if (best < 0.1) return null;
  const v0 = reflex[0]!.a;
  const d = nx * at(v0, 0) + ny * at(v0, 1) + nz * at(v0, 2);
  const onPlane = (v: number) => Math.abs(nx * at(v, 0) + ny * at(v, 1) + nz * at(v, 2) - d) <= tolerance * 10;
  return reflex.every((e) => onPlane(e.a) && onPlane(e.b)) ? { nx, ny, nz, d } : null;
}

/**
 * A folded stone's two convex pieces, each triangle going to the side its centroid is on:
 * each piece keeps its facets, gains the split plane (facing the other piece) as its last
 * plane and is linked to its partner. Both share the whole stone's radius, so absorption
 * reads the same on either side.
 */
function splitStone(position: ArrayLike<number>, triangles: number[], split: SplitPlane, radius: number): [GemStonePlanes, GemStonePlanes, Uint8Array] {
  const sideOfTriangle = new Uint8Array(triangles.length / 3);
  const facets: FacetNormal[][] = [[], []];
  const vertices: number[][] = [[], []];
  for (let t = 0; t < triangles.length; t += 3) {
    let centroid = 0;
    for (let k = 0; k < 3; k++) {
      const v = triangles[t + k]!;
      centroid += split.nx * position[v * 3]! + split.ny * position[v * 3 + 1]! + split.nz * position[v * 3 + 2]!;
    }
    const side = centroid / 3 - split.d >= 0 ? 1 : 0;
    sideOfTriangle[t / 3] = side;
    const facet = triangleNormal(position, triangles[t]!, triangles[t + 1]!, triangles[t + 2]!);
    if (facet) facets[side]!.push(facet);
    for (let k = 0; k < 3; k++) {
      const v = triangles[t + k]!;
      vertices[side]!.push(position[v * 3]!, position[v * 3 + 1]!, position[v * 3 + 2]!);
    }
  }
  const piece = (side: 0 | 1): GemStonePlanes => {
    // One plane of the budget is kept for the split plane.
    const own = extractStonePlanes(Float32Array.from(vertices[side]!), facets[side]!, MAX_GEM_PLANES - 1);
    const planes = new Float32Array((own.planeCount + 1) * 4);
    planes.set(own.planes);
    // Outward from this piece, towards the partner.
    const sign = side === 1 ? -1 : 1;
    planes.set([sign * split.nx, sign * split.ny, sign * split.nz, sign * split.d], own.planeCount * 4);
    return { planes, planeCount: own.planeCount + 1, radius, splitPlane: own.planeCount + 1 };
  };
  return [piece(0), piece(1), sideOfTriangle];
}

/** Split a gem geometry into stones and extract each stone's facet planes. */
export function buildGemTraceTable(geometry: THREE.BufferGeometry): GemTraceTable {
  const position = geometry.getAttribute("position").array as ArrayLike<number>;
  const vertexCount = geometry.getAttribute("position").count;
  const index = geometry.index ? (geometry.index.array as ArrayLike<number>) : null;
  const { islandOfVertex, islandCount, weldId } = labelGemIslands(position, index, vertexCount);

  const trianglesByIsland: number[][] = Array.from({ length: islandCount }, () => []);
  const cornerCount = index ? index.length : vertexCount;
  for (let c = 0; c + 2 < cornerCount; c += 3) {
    const a = vertexIndexOf(index, c);
    trianglesByIsland[islandOfVertex[a]!]!.push(a, vertexIndexOf(index, c + 1), vertexIndexOf(index, c + 2));
  }
  const verticesByIsland: number[][] = Array.from({ length: islandCount }, () => []);
  for (let v = 0; v < vertexCount; v++) {
    verticesByIsland[islandOfVertex[v]!]!.push(position[v * 3]!, position[v * 3 + 1]!, position[v * 3 + 2]!);
  }

  const stones: GemStonePlanes[] = [];
  const stoneOfIsland = new Int32Array(islandCount);
  const stoneOfVertex = new Float32Array(vertexCount);
  const pieces: { triangles: number[]; first: number; sides: Uint8Array }[] = [];
  trianglesByIsland.forEach((triangles, island) => {
    const islandPositions = Float32Array.from(verticesByIsland[island]!);
    const facets: FacetNormal[] = [];
    for (let t = 0; t < triangles.length; t += 3) {
      const facet = triangleNormal(position, triangles[t]!, triangles[t + 1]!, triangles[t + 2]!);
      if (facet) facets.push(facet);
    }
    const whole = extractStonePlanes(islandPositions, facets);
    // Pieces are assigned per triangle, so a split needs each vertex to belong to one triangle.
    const split = index ? null : reflexSplitPlane(position, triangles, weldId, boundingSize(islandPositions, islandPositions.length / 3));
    stoneOfIsland[island] = stones.length;
    if (!split) {
      stones.push(whole);
      return;
    }
    const [below, above, sides] = splitStone(position, triangles, split, whole.radius);
    const first = stones.length;
    stones.push({ ...below, partner: first + 1 }, { ...above, partner: first });
    pieces.push({ triangles, first, sides });
  });
  for (let v = 0; v < vertexCount; v++) stoneOfVertex[v] = stoneOfIsland[islandOfVertex[v]!]!;
  for (const { triangles, first, sides } of pieces) {
    for (let t = 0; t < triangles.length; t += 3) {
      for (let k = 0; k < 3; k++) stoneOfVertex[triangles[t + k]!] = first + sides[t / 3]!;
    }
  }
  return { stones, stoneOfVertex };
}
