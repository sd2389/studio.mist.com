import * as THREE from "three";
import { GEM_GPU_USER_KEY } from "./gem-gpu/gem-physical-material";
import { isGemTraceMaterial, setGemTraceEnvironment } from "./gem-gpu/gem-trace-material";

export type JewelryEnvironment = { texture: THREE.Texture; rotation: number; intensity: number };

function isGemMesh(object: THREE.Mesh): boolean {
  const role = object.userData.jewelryRole;
  const slot = String(object.userData.devjewelsSlot ?? object.name);
  return role === "gem" || role === "accent-gem" || /^(gem|accent|diamond|stone)\b/i.test(slot);
}

/** Each material retains its physical reflection strength as studio lighting changes. */
export function createJewelryEnvironmentApplicator() {
  const baseIntensities = new WeakMap<THREE.Material, number>();
  return (root: THREE.Object3D, metal: JewelryEnvironment, gem: JewelryEnvironment) => {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const gemMesh = isGemMesh(object);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        // Traced stones sample the HDR themselves, unfiltered, which is what keeps facet
        // flashes pinpoint-sharp; the prefiltered envMap path would blur them.
        if (isGemTraceMaterial(material)) {
          setGemTraceEnvironment(material, gem.texture, gem.rotation, gem.intensity);
          continue;
        }
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
