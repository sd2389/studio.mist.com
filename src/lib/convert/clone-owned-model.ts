import * as THREE from "three";

/** Own geometry and materials so thumbnail/export cleanup cannot damage the editor. */
export function cloneOwnedModel(root: THREE.Object3D): THREE.Object3D {
  const clone = root.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
  });
  return clone;
}
