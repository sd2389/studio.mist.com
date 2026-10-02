import { weldPositions, type WeldResult } from "./weld";

/** Connected components of a triangle mesh after position welding. */
export type IslandLabels = {
  weld: WeldResult;
  /** Welded corner ids, three per triangle. */
  corners: Uint32Array;
  triangleCount: number;
  islandOfTriangle: Uint32Array;
  islandCount: number;
};

/** Triangle ids grouped per island: island `i` owns `triangles[offsets[i] .. offsets[i + 1])`. */
export type IslandTriangles = {
  offsets: Uint32Array;
  triangles: Uint32Array;
};

function findRoot(parent: Int32Array, start: number): number {
  let node = start;
  while (parent[node] !== node) {
    const grand = parent[parent[node]];
    parent[node] = grand;
    node = grand;
  }
  return node;
}

function weldedCorners(
  weld: WeldResult,
  index: ArrayLike<number> | null,
  cornerCount: number,
): Uint32Array {
  const corners = new Uint32Array(cornerCount);
  for (let c = 0; c < cornerCount; c++) {
    corners[c] = weld.weldIdOfVertex[index ? index[c] : c];
  }
  return corners;
}

/** Label every triangle with its island (triangles sharing a welded corner are connected). */
export function labelIslands(
  position: ArrayLike<number>,
  index: ArrayLike<number> | null,
  vertexCount: number,
  tolerance: number,
): IslandLabels {
  const weld = weldPositions(position, vertexCount, tolerance);
  const rawCornerCount = index ? index.length : vertexCount;
  const cornerCount = rawCornerCount - (rawCornerCount % 3);
  const corners = weldedCorners(weld, index, cornerCount);
  const triangleCount = cornerCount / 3;

  const parent = new Int32Array(weld.weldCount);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  for (let t = 0; t < triangleCount; t++) {
    const a = findRoot(parent, corners[t * 3]);
    const b = findRoot(parent, corners[t * 3 + 1]);
    const c = findRoot(parent, corners[t * 3 + 2]);
    parent[b] = a;
    parent[findRoot(parent, c)] = a;
  }

  const islandOfRoot = new Int32Array(weld.weldCount).fill(-1);
  const islandOfTriangle = new Uint32Array(triangleCount);
  let islandCount = 0;
  for (let t = 0; t < triangleCount; t++) {
    const root = findRoot(parent, corners[t * 3]);
    if (islandOfRoot[root] === -1) islandOfRoot[root] = islandCount++;
    islandOfTriangle[t] = islandOfRoot[root];
  }

  return { weld, corners, triangleCount, islandOfTriangle, islandCount };
}

/** Counting-sort triangles by island so each island's triangles are contiguous. */
export function groupTrianglesByIsland(labels: IslandLabels): IslandTriangles {
  const offsets = new Uint32Array(labels.islandCount + 1);
  for (let t = 0; t < labels.triangleCount; t++) offsets[labels.islandOfTriangle[t] + 1] += 1;
  for (let i = 0; i < labels.islandCount; i++) offsets[i + 1] += offsets[i];
  const cursor = offsets.slice(0, labels.islandCount);
  const triangles = new Uint32Array(labels.triangleCount);
  for (let t = 0; t < labels.triangleCount; t++) {
    triangles[cursor[labels.islandOfTriangle[t]]++] = t;
  }
  return { offsets, triangles };
}
