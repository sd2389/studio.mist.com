import * as THREE from "three";
import { JEWELRY_MODEL_ROOT_KEY } from "@/features/scene-setups";
import { isSetPiece, isShadowCatcher } from "../../lib/stage-visibility";
import { boundsFromPoints, type ModelBounds } from "../domain/framing";
import type { Vec3 } from "../domain/types";

const DEFAULT_MAX_POINTS = 24_000;

export function findModelRoot(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((object) => {
    if (!found && object.userData?.[JEWELRY_MODEL_ROOT_KEY] === true) found = object;
  });
  return found;
}

function hasVisibleMaterial(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => material.visible);
}

export type SampleOptions = {
  /** Restrict framing to some meshes (e.g. the stones for a cut-scope close-up). */
  include?: (mesh: THREE.Mesh) => boolean;
  maxPoints?: number;
};

function framingMeshes(root: THREE.Object3D, include?: (mesh: THREE.Mesh) => boolean): THREE.Mesh[] {
  const scope = findModelRoot(root) ?? root;
  const meshes: THREE.Mesh[] = [];
  scope.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
    if (isShadowCatcher(object) || isSetPiece(object) || !hasVisibleMaterial(object)) return;
    if (include && !include(object)) return;
    if (object.geometry?.getAttribute("position")) meshes.push(object);
  });
  return meshes;
}

/**
 * World-space vertex sample of the visible jewelry (strided, so a 2M-vertex CAD mesh stays
 * cheap). Vertices rather than bounding boxes: a ring's box corners sit far outside its
 * silhouette and would frame it loose.
 */
export function sampleModelPoints(root: THREE.Object3D, options: SampleOptions = {}): ModelBounds | null {
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  root.updateMatrixWorld(true);
  const meshes = framingMeshes(root, options.include);
  const total = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count, 0);
  if (total === 0) return null;
  const stride = Math.max(1, Math.ceil(total / maxPoints));
  const points: Vec3[] = [];
  const vertex = new THREE.Vector3();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += stride) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      points.push([vertex.x, vertex.y, vertex.z]);
    }
  }
  return boundsFromPoints(points);
}
