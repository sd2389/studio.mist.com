import * as THREE from "three";

/** Placeholder metal until the studio assigns slot materials (preview + thumbnail only). */
export function createMetalPreviewMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: 0xd4d4d8, metalness: 1, roughness: 0.18 });
}

/** Placeholder stone until the studio assigns slot materials (preview + thumbnail only). */
export function createGemPreviewMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.05,
    transmission: 0.9,
    thickness: 0.4,
    ior: 2.0,
    transparent: true,
  });
}
