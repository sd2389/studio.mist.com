import * as THREE from "three";
import { createPresetMaterial } from "@/lib/material-presets";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import type { GemPresetId } from "@/lib/gem-gpu/gem-configs";

const GLTF_GEM_SLOT = "Carbon";
const GLTF_BAND_SLOT = "Titan";

function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

export function canApplySplitGemBand(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if (found) return;
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of meshMaterials(o)) {
      if (m.name === GLTF_GEM_SLOT || m.name === GLTF_BAND_SLOT) {
        found = true;
        return;
      }
    }
  });
  return found;
}

export function applySplitGemBandPreset(
  root: THREE.Object3D,
  gemPreset: GemPresetId = "diamond"
): void {
  const gem = createGemMaterial(gemPreset);
  const band = createPresetMaterial("platinum");

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const assignFor = (src: THREE.Material): THREE.Material => {
      if (src.name === GLTF_GEM_SLOT) return gem.clone();
      if (src.name === GLTF_BAND_SLOT) return band.clone();
      if (src.name) return band.clone();
      return gem.clone();
    };

    if (Array.isArray(obj.material)) {
      const next = obj.material.map((m) => {
        const nextMat = assignFor(m);
        m.dispose();
        return nextMat;
      });
      obj.material = next;
    } else {
      const next = assignFor(obj.material);
      obj.material.dispose();
      obj.material = next;
    }
  });
}
