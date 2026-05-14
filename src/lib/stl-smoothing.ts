import * as THREE from "three";
import { mergeVertices } from "three-stdlib";
import { LoopSubdivision } from "three-subdivide";

/**
 * Two-stage smoother for CAD meshes (STL primarily):
 *
 *   1. mergeVertices collapses duplicate corner positions so adjacent triangles
 *      share verts (STL writes every triangle as 3 unshared corners).
 *   2. LoopSubdivision optionally splits each triangle and averages neighbours,
 *      gaining a quadrant of new geometry per iteration. Skipped when the mesh
 *      is already dense — runaway memory otherwise.
 *
 * Each iteration ~4x triangle count. 1 iteration on a 60k-tri mesh → 240k. 2
 * iterations → ~1M. We cap iterations dynamically based on input size and the
 * `quality` knob.
 */
export type MeshQuality = "native" | "smooth" | "ultra";

const QUALITY_TRI_BUDGETS: Record<MeshQuality, number> = {
  native: 0,
  smooth: 400_000,
  ultra: 1_500_000,
};

function triangleCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
}

export function smoothStlGeometry(
  source: THREE.BufferGeometry,
  toleranceRatio = 1e-4,
  quality: MeshQuality = "smooth",
): THREE.BufferGeometry {
  const cloned = source.clone();
  cloned.computeBoundingBox();
  const size = new THREE.Vector3();
  cloned.boundingBox?.getSize(size);
  const longest = Math.max(size.x, size.y, size.z, 1);
  const tolerance = longest * toleranceRatio;

  let merged = mergeVertices(cloned, tolerance);
  merged.computeVertexNormals();

  const budget = QUALITY_TRI_BUDGETS[quality];
  if (budget > 0) {
    let iterations = 0;
    let triCount = triangleCount(merged);
    while (triCount * 4 <= budget && iterations < 3) {
      iterations += 1;
      triCount *= 4;
    }
    if (iterations > 0) {
      merged = LoopSubdivision.modify(merged, iterations, {
        split: true,
        uvSmooth: false,
        preserveEdges: true,
        flatOnly: false,
        maxTriangles: budget,
      });
      merged.computeVertexNormals();
    }
  }

  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
