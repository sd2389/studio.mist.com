import * as THREE from "three";

export const FACETED_GEM_NORMALS_KEY = "gemFacetedNormals" as const;

/**
 * CAD gem meshes often arrive with smoothed vertex normals. Jewelry fire needs
 * per-face normals. Procedural cuts in cut-geometries.ts already flat-shade —
 * skip those via the userData flag after first prep.
 */
export function ensureFacetedGemNormals(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  if (geometry.userData[FACETED_GEM_NORMALS_KEY] === true) {
    return geometry;
  }

  const source = geometry.index ? geometry : geometry;
  const faceted = source.index ? source.toNonIndexed() : source.clone();
  faceted.computeVertexNormals();
  faceted.computeBoundingSphere();
  faceted.userData[FACETED_GEM_NORMALS_KEY] = true;

  if (faceted !== geometry) {
    // Caller owns disposal of the previous geometry when replacing on a mesh.
  }
  return faceted;
}

export function ensureFacetedGemNormalsOnMesh(mesh: THREE.Mesh): void {
  const next = ensureFacetedGemNormals(mesh.geometry);
  if (next !== mesh.geometry) {
    mesh.geometry.dispose();
    mesh.geometry = next;
  }
}
