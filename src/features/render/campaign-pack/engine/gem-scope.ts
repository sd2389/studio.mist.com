import * as THREE from "three";
import { isGemTraceMaterial, setGemTraceScope } from "@/lib/gem-gpu/gem-trace-material";
import { findModelRoot } from "./scene-points";

export type TracedGems = {
  materials: THREE.Material[];
  meshes: Set<THREE.Mesh>;
};

/** Ray-traced stones of the piece itself (set props such as quartz keep photo shading). */
export function collectTracedGems(root: THREE.Object3D): TracedGems {
  const materials = new Set<THREE.Material>();
  const meshes = new Set<THREE.Mesh>();
  (findModelRoot(root) ?? root).traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!isGemTraceMaterial(material)) continue;
      materials.add(material);
      meshes.add(object);
    }
  });
  return { materials: [...materials], meshes };
}

export function sceneHasTracedGems(root: THREE.Object3D | null | undefined): boolean {
  return root ? collectTracedGems(root).materials.length > 0 : false;
}

/**
 * Toggles the ASET scope on the shared gem materials. Called synchronously right before each
 * capture, so neither the live GemScopeBridge nor a viewer left in ASET mode can leak into
 * product shots; the bridge re-applies the viewer's own mode on its next live frame.
 */
export function createScopeSwitch(gems: TracedGems): (enabled: boolean) => void {
  return (enabled) => {
    for (const material of gems.materials) setGemTraceScope(material, enabled);
  };
}
