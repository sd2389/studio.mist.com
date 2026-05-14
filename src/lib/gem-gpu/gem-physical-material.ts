import * as THREE from "three";
import { GEM_CONFIGS, type GemPresetId } from "@/lib/gem-gpu/gem-configs";

export const GEM_GPU_USER_KEY = "gemGpuDiamond" as const;

export function createGemMaterial(presetId: GemPresetId): THREE.MeshPhysicalMaterial {
  const cfg = GEM_CONFIGS[presetId];
  const transmission = cfg.transmission ?? 1;
  const m = new THREE.MeshPhysicalMaterial({
    name: `GemGPU-${presetId}`,
    color: new THREE.Color(cfg.baseColor),
    metalness: 0,
    roughness: cfg.roughness,
    transmission,
    thickness: cfg.thickness,
    ior: cfg.ior,
    dispersion: cfg.dispersionBase,
    transparent: transmission > 0,
    envMapIntensity: cfg.envMapIntensity * 1.25,
    attenuationColor: new THREE.Color(cfg.attenuationColor),
    attenuationDistance: cfg.attenuationDistance,
    specularIntensity: 1.0,
    specularColor: new THREE.Color(0xffffff),
    reflectivity: 0.6,
    clearcoat: cfg.clearcoat ?? 0,
    clearcoatRoughness: cfg.clearcoat ? 0.02 : 0,
    iridescence: cfg.iridescence ?? 0,
    iridescenceIOR: cfg.iridescence ? 1.3 : 1,
    flatShading: false,
  });
  m.userData[GEM_GPU_USER_KEY] = presetId;
  return m;
}

export function createGemGpuDiamondMaterial(): THREE.MeshPhysicalMaterial {
  return createGemMaterial("diamond");
}

export function isGemGpuMaterial(
  m: THREE.Material
): m is THREE.MeshPhysicalMaterial {
  if (!(m instanceof THREE.MeshPhysicalMaterial)) return false;
  const tag = m.userData[GEM_GPU_USER_KEY];
  return typeof tag === "string" || tag === true;
}

export const isGemGpuDiamondMaterial = isGemGpuMaterial;

export function gemPresetIdFromMaterial(
  m: THREE.MeshPhysicalMaterial
): GemPresetId | null {
  const tag = m.userData[GEM_GPU_USER_KEY];
  if (typeof tag === "string") return tag as GemPresetId;
  if (tag === true) return "diamond";
  return null;
}
