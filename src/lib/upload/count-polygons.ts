import * as THREE from "three";

export const POLY_WARN_THRESHOLD = 100_000;

export function countMeshTriangles(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry) return 0;
  const index = geometry.index;
  if (index) return Math.floor(index.count / 3);
  const position = geometry.attributes.position;
  if (!position) return 0;
  return Math.floor(position.count / 3);
}

export function countPolygons(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) total += countMeshTriangles(obj);
  });
  return total;
}

export function formatPolyCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count);
}
