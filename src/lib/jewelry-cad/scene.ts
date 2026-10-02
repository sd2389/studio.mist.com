import * as THREE from "three";
import type { BuiltPart, JewelryRole } from "@/lib/jewelry-cad/types";

/**
 * Built parts → a three.js group the studio understands: one mesh per slot, named after
 * the slot (`Metal 1`, `Heads`, `Gem 1`, `Accent 1`…) with `userData.jewelryRole` set, so
 * `detect-slots.ts` and role-based material assignment both work without guessing.
 */

export const JEWELRY_ROLE_KEY = "jewelryRole" as const;

export function getJewelryRole(object: THREE.Object3D): JewelryRole | null {
  return (object.userData[JEWELRY_ROLE_KEY] as JewelryRole | undefined) ?? null;
}

export function partToMesh(part: BuiltPart, material?: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(part.geometry, material ?? new THREE.MeshStandardMaterial({ name: part.slot }));
  mesh.name = part.slot;
  mesh.userData[JEWELRY_ROLE_KEY] = part.role;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Group of slot meshes in millimetres. `name` must not contain slot words (see detect-slots). */
export function partsToGroup(parts: BuiltPart[], name = "MIST Design"): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  for (const part of parts) group.add(partToMesh(part));
  return group;
}

/**
 * Uniform scale that fits the object's largest dimension to `size` scene units, and the
 * offset that centres it — for canvases tuned to unit-sized models.
 */
export function fitTransform(object: THREE.Object3D, size: number): { scale: number; offset: THREE.Vector3 } {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const dims = box.getSize(new THREE.Vector3());
  const scale = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
  const offset = box.getCenter(new THREE.Vector3()).multiplyScalar(-scale);
  return { scale, offset };
}
