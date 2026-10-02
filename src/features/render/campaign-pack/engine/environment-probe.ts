import * as THREE from "three";
import { waitForRenderFrames } from "@/lib/variants/wait-for-render";
import type { MetalEnvironment } from "./metal-skin";

const PROBE_NAME = "__campaign-pack-env-probe";

/**
 * Re-skinned metals live only in the export clone, which the studio's per-frame
 * environment applicator never visits. A hidden probe mesh in the live scene lets that
 * applicator tell us the metal HDR, its rotation and the intensity multiplier — exactly as it
 * would light a metal the user picked — without duplicating its catalog lookups.
 */
export async function probeMetalEnvironment(
  liveScene: THREE.Scene,
  maxFrames = 12,
): Promise<MetalEnvironment | null> {
  const material = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.2, envMapIntensity: 1 });
  const geometry = new THREE.BufferGeometry();
  const probe = new THREE.Mesh(geometry, material);
  probe.name = PROBE_NAME;
  probe.visible = false;
  probe.frustumCulled = false;
  liveScene.add(probe);
  try {
    for (let frame = 0; frame < maxFrames && !material.envMap; frame += 1) {
      await waitForRenderFrames(1);
    }
    if (!material.envMap) return null;
    return {
      texture: material.envMap,
      rotation: material.envMapRotation.clone(),
      intensityScale: material.envMapIntensity,
    };
  } finally {
    liveScene.remove(probe);
    geometry.dispose();
    material.dispose();
  }
}
