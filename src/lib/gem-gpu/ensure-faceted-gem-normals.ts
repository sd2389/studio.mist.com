import * as THREE from "three";

export const FACETED_GEM_NORMALS_KEY = "gemFacetedNormals" as const;

/** True when every triangle of a non-indexed geometry already carries one shared normal. */
function hasFlatNormals(geometry: THREE.BufferGeometry): boolean {
  if (geometry.index) return false;
  const normal = geometry.getAttribute("normal");
  if (!normal) return false;
  const n = normal.array as ArrayLike<number>;
  for (let tri = 0; tri + 8 < n.length; tri += 9) {
    for (let k = 3; k < 9; k += 3) {
      if (
        Math.abs(n[tri]! - n[tri + k]!) > 1e-4 ||
        Math.abs(n[tri + 1]! - n[tri + k + 1]!) > 1e-4 ||
        Math.abs(n[tri + 2]! - n[tri + k + 2]!) > 1e-4
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * CAD gem meshes often arrive with smoothed vertex normals. Jewelry fire needs
 * per-face normals. Geometry that is already non-indexed with flat normals (the
 * procedural and CAD cut libraries) is only flagged, never copied — copying shared
 * cache geometry on every re-render would leak a new copy each time.
 */
export function ensureFacetedGemNormals(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  if (geometry.userData[FACETED_GEM_NORMALS_KEY] === true) {
    return geometry;
  }
  if (hasFlatNormals(geometry)) {
    geometry.userData[FACETED_GEM_NORMALS_KEY] = true;
    return geometry;
  }

  const faceted = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  faceted.computeVertexNormals();
  faceted.computeBoundingSphere();
  faceted.userData[FACETED_GEM_NORMALS_KEY] = true;
  return faceted;
}

/**
 * Replace mesh geometry with a faceted copy when needed.
 *
 * Intentionally does **not** dispose the previous geometry: JewelryModel clones
 * GLTF scenes with `raw.clone(true)`, which shares BufferGeometry with the
 * useGLTF cache. Disposing here would corrupt other viewers / the cache.
 * Callers that own exclusive geometry may dispose the old buffer themselves.
 */
export function ensureFacetedGemNormalsOnMesh(mesh: THREE.Mesh): void {
  const next = ensureFacetedGemNormals(mesh.geometry);
  if (next !== mesh.geometry) {
    mesh.geometry = next;
  }
}
