import * as THREE from "three";
import { GEM_GPU_USER_KEY } from "./gem-gpu/gem-physical-material";

export type JewelryEnvironment = { texture: THREE.Texture; rotation: number; intensity: number };

/** Each material retains its physical reflection strength as studio lighting changes. */
export function createJewelryEnvironmentApplicator() {
  const baseIntensities = new WeakMap<THREE.Material, number>();
  return (root: THREE.Object3D, metal: JewelryEnvironment, gem: JewelryEnvironment) => {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const role = object.userData.jewelryRole;
      const slot = String(object.userData.devjewelsSlot ?? object.name);
      const gemMesh = role === "gem" || role === "accent-gem" || /^(gem|accent|diamond|stone)\b/i.test(slot);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const isGem = gemMesh || Boolean(material.userData[GEM_GPU_USER_KEY]) ||
          (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0);
        const environment = isGem ? gem : metal;
        if (!baseIntensities.has(material)) baseIntensities.set(material, material.envMapIntensity);
        if (material.envMap !== environment.texture) {
          material.envMap = environment.texture;
          material.needsUpdate = true;
        }
        material.envMapRotation.set(0, environment.rotation, 0);
        material.envMapIntensity = baseIntensities.get(material)! * environment.intensity;
      }
    });
  };
}
