import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { splitIslands, type BuiltPart } from "@/lib/jewelry-cad";

/** Test-only geometry queries: part connectivity and point-to-polyline distance. */

const IDENTITY = new THREE.Matrix4();

function triangles(g: THREE.BufferGeometry): number {
  return (g.getIndex()?.count ?? g.getAttribute("position").count) / 3;
}

function boxOf(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox!.clone();
}

/**
 * Connected components of all metal islands, where two islands are joined when their
 * surfaces intersect (one is embedded in the other) or come within `tolerance` mm.
 * A correctly assembled piece is one component: nothing floats.
 */
export function metalComponents(parts: BuiltPart[], tolerance = 0.02): number {
  const islands = parts.filter((p) => p.role === "metal").flatMap((p) => splitIslands(p.geometry));
  const boxes = islands.map((g) => boxOf(g).expandByScalar(tolerance));
  const bvhs = islands.map((g) => new MeshBVH(g.clone()));
  const parent = islands.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < islands.length; i++) {
    for (let j = i + 1; j < islands.length; j++) {
      if (find(i) === find(j) || !boxes[i]!.intersectsBox(boxes[j]!)) continue;
      // Walk the smaller island's triangles against the bigger island's BVH.
      const [big, small] = triangles(islands[i]!) >= triangles(islands[j]!) ? [i, j] : [j, i];
      const touching =
        bvhs[big]!.intersectsGeometry(islands[small]!, IDENTITY) ||
        (bvhs[big]!.closestPointToGeometry(islands[small]!, IDENTITY)?.distance ?? Infinity) <= tolerance;
      if (touching) parent[find(j)] = find(i);
    }
  }
  return new Set(islands.map((_, i) => find(i))).size;
}

export function distanceToPolyline(point: THREE.Vector3, path: THREE.Vector3[]): number {
  let best = Infinity;
  const segment = new THREE.Line3();
  const closest = new THREE.Vector3();
  for (let i = 0; i + 1 < path.length; i++) {
    segment.set(path[i]!, path[i + 1]!);
    segment.closestPointToPoint(point, true, closest);
    best = Math.min(best, closest.distanceTo(point));
  }
  return best;
}

export function partBySlot(parts: BuiltPart[], slot: string): BuiltPart {
  const part = parts.find((p) => p.slot === slot);
  if (!part) throw new Error(`No ${slot} part`);
  return part;
}

export function bounds(part: BuiltPart): THREE.Box3 {
  return boxOf(part.geometry);
}
