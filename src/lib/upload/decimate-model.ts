import * as THREE from "three";
import { MeshoptSimplifier } from "meshoptimizer";
import { computeCreasedNormals } from "@/lib/convert/segmentation/normals";
import { weldPositions, weldToleranceFor } from "@/lib/convert/segmentation/weld";
import { geometryExtent, readPositions } from "@/lib/mesh-segmentation";
import { countMeshTriangles, countPolygons } from "./count-polygons";

/**
 * Brings a model under a plan's polygon cap by simplifying metal only. Stones are never
 * touched — collapsing one facet edge destroys a cut — so their triangles are subtracted from
 * the budget first and metal shrinks to fit what is left.
 */

/** Even when stones alone blow the budget, metal keeps this share of its triangles. */
const MIN_METAL_RATIO = 0.05;

export function isGemMesh(mesh: THREE.Mesh): boolean {
  const role = mesh.userData.jewelryRole;
  if (role === "gem" || role === "accent-gem") return true;
  const slot = String(mesh.userData.devjewelsSlot ?? mesh.name ?? "");
  return /^(gem|accent)\b/i.test(slot);
}

export type MetalDecimationPlan = {
  gemTriangles: number;
  metalTriangles: number;
  /** Triangles metal may keep so metal + untouched stones fit the target. */
  metalBudget: number;
  /** Share of metal triangles to keep (1 = nothing to do). */
  keepRatio: number;
};

export function planMetalDecimation(root: THREE.Object3D, targetTriangles: number): MetalDecimationPlan {
  let gemTriangles = 0;
  let metalTriangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (isGemMesh(object)) gemTriangles += countMeshTriangles(object);
    else metalTriangles += countMeshTriangles(object);
  });
  const metalBudget = Math.max(0, targetTriangles - gemTriangles);
  const keepRatio = metalTriangles > metalBudget
    ? Math.max(MIN_METAL_RATIO, metalBudget / metalTriangles)
    : 1;
  return { gemTriangles, metalTriangles, metalBudget, keepRatio };
}

function cornerIndex(geometry: THREE.BufferGeometry, weldIdOfVertex: Uint32Array): Uint32Array {
  const count = geometry.index ? geometry.index.count : weldIdOfVertex.length;
  const index = new Uint32Array(count - (count % 3));
  for (let c = 0; c < index.length; c++) {
    index[c] = weldIdOfVertex[geometry.index ? geometry.index.getX(c) : c];
  }
  return index;
}

/** Welded, meshopt-simplified copy with crease-aware normals, or null when not worth it. */
function simplifyMetalGeometry(geometry: THREE.BufferGeometry, keepRatio: number): THREE.BufferGeometry | null {
  const positions = readPositions(geometry);
  // Weld by position so seams that split normals or UVs do not become simplifier borders.
  const weld = weldPositions(positions, positions.length / 3, weldToleranceFor(geometryExtent(geometry)));
  const index = cornerIndex(geometry, weld.weldIdOfVertex);
  const targetIndexCount = Math.floor((index.length / 3) * keepRatio) * 3;
  if (targetIndexCount >= index.length || index.length < 36) return null;
  // Error bound 1 (the whole extent): the triangle target, not the error, decides where to stop.
  const [simplified] = MeshoptSimplifier.simplify(index, weld.positions, 3, targetIndexCount, 1);
  const smooth = computeCreasedNormals({ positions: weld.positions, index: simplified });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(smooth.positions, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(smooth.normals, 3));
  out.setIndex(new THREE.BufferAttribute(smooth.index, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Simplify metal meshes toward `targetTriangles`; returns the model's new triangle count. */
export async function decimateModelRoot(root: THREE.Object3D, targetTriangles: number): Promise<number> {
  const plan = planMetalDecimation(root, targetTriangles);
  if (plan.keepRatio >= 1) return countPolygons(root);
  await MeshoptSimplifier.ready;
  const metalMeshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !isGemMesh(object) && object.geometry?.getAttribute("position")) {
      metalMeshes.push(object);
    }
  });
  for (const mesh of metalMeshes) {
    try {
      const simplified = simplifyMetalGeometry(mesh.geometry, plan.keepRatio);
      if (!simplified) continue;
      mesh.geometry.dispose();
      mesh.geometry = simplified;
      // The simplified geometry has no material groups left to index a material array.
      if (Array.isArray(mesh.material)) mesh.material = mesh.material[0];
    } catch (err) {
      console.warn("[decimate] metal simplify failed:", err);
    }
  }
  return countPolygons(root);
}
