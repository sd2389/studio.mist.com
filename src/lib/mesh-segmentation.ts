import * as THREE from "three";
import {
  groupTrianglesByIsland,
  labelIslands,
  type IslandLabels,
  type IslandTriangles,
} from "@/lib/convert/segmentation/islands";
import { measureIsland, type IslandMetrics } from "@/lib/convert/segmentation/island-metrics";
import {
  assignIslandSlots,
  type IslandSlot,
  type JewelryRole,
} from "@/lib/convert/segmentation/island-slots";
import { weldToleranceFor } from "@/lib/convert/segmentation/weld";

/**
 * Metal vs gem segmentation for merged or unlabelled meshes (STL, OBJ, PLY, 3MF, STEP…).
 *
 * The mesh is welded by position, split into connected islands (the band is one island, each
 * detached stone another) and every island is classified by shape: stones are closed, convex
 * solids covered by a few large planar facets; metal is smooth, non-convex or rod-like.
 *
 * Caveat: stones boolean-unioned into the metal form one island and cannot be separated.
 */

export { isGemShaped, measureIsland, type IslandMetrics } from "@/lib/convert/segmentation/island-metrics";
export { assignIslandSlots, type IslandSlot, type JewelryRole } from "@/lib/convert/segmentation/island-slots";

/**
 * Hard ceiling on triangle count before segmentation is skipped. Welding and island labelling
 * are linear typed-array passes, so heavy pavé exports still segment; past this, memory rules.
 */
export const MAX_TRI_FOR_SEGMENTATION = 2_000_000;

export type GeometryIslands = {
  labels: IslandLabels;
  groups: IslandTriangles;
  metrics: IslandMetrics[];
};

/** Contiguous xyz positions, whatever the attribute layout. */
export function readPositions(geometry: THREE.BufferGeometry): Float32Array {
  const attribute = geometry.getAttribute("position");
  if (attribute instanceof THREE.BufferAttribute && attribute.itemSize === 3 &&
      attribute.array instanceof Float32Array && !attribute.normalized) {
    return attribute.array;
  }
  const out = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    out[i * 3] = attribute.getX(i);
    out[i * 3 + 1] = attribute.getY(i);
    out[i * 3 + 2] = attribute.getZ(i);
  }
  return out;
}

export function triangleCountOf(geometry: THREE.BufferGeometry): number {
  const count = geometry.index ? geometry.index.count : (geometry.getAttribute("position")?.count ?? 0);
  return Math.floor(count / 3);
}

export function geometryExtent(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3();
  return Math.max(size.x, size.y, size.z);
}

export function islandTriangleIds(groups: IslandTriangles, island: number): Uint32Array {
  return groups.triangles.subarray(groups.offsets[island], groups.offsets[island + 1]);
}

/** Weld, split into islands and measure each one. Null when the mesh is too heavy to segment. */
export function measureGeometryIslands(
  geometry: THREE.BufferGeometry,
  tolerance = weldToleranceFor(geometryExtent(geometry)),
): GeometryIslands | null {
  if (!geometry.getAttribute("position")) return null;
  if (triangleCountOf(geometry) > MAX_TRI_FOR_SEGMENTATION) return null;
  const positions = readPositions(geometry);
  const index = geometry.index ? geometry.index.array : null;
  const labels = labelIslands(positions, index, positions.length / 3, tolerance);
  const groups = groupTrianglesByIsland(labels);
  const metrics: IslandMetrics[] = [];
  for (let island = 0; island < labels.islandCount; island++) {
    metrics.push(measureIsland(labels.weld.positions, labels.corners, islandTriangleIds(groups, island)));
  }
  return { labels, groups, metrics };
}

function copyCorner(
  source: THREE.BufferGeometry,
  vertex: number,
  cursor: number,
  targets: Map<string, Float32Array>,
): void {
  for (const [name, target] of targets) {
    const attribute = source.getAttribute(name);
    for (let k = 0; k < attribute.itemSize; k++) {
      target[cursor * attribute.itemSize + k] = attribute.getComponent(vertex, k);
    }
  }
}

function buildIslandGeometry(source: THREE.BufferGeometry, triangleIds: ArrayLike<number>): THREE.BufferGeometry {
  const names = ["position", "normal", "uv"].filter((name) => source.getAttribute(name));
  const targets = new Map(names.map((name) =>
    [name, new Float32Array(triangleIds.length * 3 * source.getAttribute(name).itemSize)]));
  let cursor = 0;
  for (let i = 0; i < triangleIds.length; i++) {
    for (let k = 0; k < 3; k++) {
      const corner = triangleIds[i] * 3 + k;
      copyCorner(source, source.index ? source.index.getX(corner) : corner, cursor++, targets);
    }
  }
  const out = new THREE.BufferGeometry();
  for (const [name, array] of targets) {
    out.setAttribute(name, new THREE.BufferAttribute(array, source.getAttribute(name).itemSize));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Split a geometry into its disconnected islands (non-indexed, source attributes kept). */
export function splitIslands(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const measured = measureGeometryIslands(geometry);
  if (!measured || measured.labels.islandCount <= 1) return [geometry.clone()];
  const islands: THREE.BufferGeometry[] = [];
  for (let island = 0; island < measured.labels.islandCount; island++) {
    islands.push(buildIslandGeometry(geometry, islandTriangleIds(measured.groups, island)));
  }
  return islands;
}

/** Metrics for a geometry that is already a single island. */
function measureWholeGeometry(geometry: THREE.BufferGeometry): IslandMetrics {
  const positions = readPositions(geometry);
  const index = geometry.index ? geometry.index.array : null;
  const labels = labelIslands(positions, index, positions.length / 3, weldToleranceFor(geometryExtent(geometry)));
  const all = new Uint32Array(labels.triangleCount).map((_, i) => i);
  return measureIsland(labels.weld.positions, labels.corners, all);
}

/** Slot + role for already-split islands (see `assignIslandSlots`). */
export function classifyIslandSlots(islands: THREE.BufferGeometry[]): IslandSlot[] {
  return assignIslandSlots(islands.map(measureWholeGeometry));
}

/** Role of each island: metal, gem (main or lone stone) or accent-gem (repeated smaller cut). */
export function classifyIslands(islands: THREE.BufferGeometry[]): JewelryRole[] {
  return classifyIslandSlots(islands).map((slot) => slot.role);
}
