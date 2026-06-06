import * as THREE from "three";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { countPolygons } from "./count-polygons";

const modifier = new SimplifyModifier();

/** Reduce mesh complexity toward a target triangle budget (best-effort). */
export function decimateModelRoot(root: THREE.Object3D, targetTriangles: number): number {
  let current = countPolygons(root);
  if (current <= targetTriangles) return current;

  const ratio = targetTriangles / current;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry?.attributes?.position) return;
    const position = obj.geometry.attributes.position;
    const vertexCount = position.count;
    if (vertexCount < 12) return;

    const removeCount = Math.floor(vertexCount * (1 - ratio));
    if (removeCount < 1) return;

    try {
      const simplified = modifier.modify(obj.geometry.clone(), removeCount);
      simplified.computeVertexNormals();
      obj.geometry.dispose();
      obj.geometry = simplified;
    } catch (err) {
      console.warn("[decimate] mesh simplify failed:", err);
    }
  });

  current = countPolygons(root);
  return current;
}
