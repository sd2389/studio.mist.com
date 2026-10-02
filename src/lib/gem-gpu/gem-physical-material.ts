import * as THREE from "three";
import { GEM_CONFIGS, type GemConfig, type GemPresetId } from "@/lib/gem-gpu/gem-configs";
import { applyJewelryGemShader } from "@/lib/gem-gpu/jewelry-gem-shader";
import {
  applyGemTrace,
  GEM_TRACE_BOUNCES,
  gemTraceParamsFromConfig,
  isGemTraceCandidate,
} from "@/lib/gem-gpu/gem-trace-material";

export const GEM_GPU_USER_KEY = "gemGpuDiamond" as const;

export type CreateGemMaterialOptions = {
  qualityReduce?: boolean;
};

export function createGemMaterial(
  presetId: GemPresetId,
  options: CreateGemMaterialOptions = {},
): THREE.MeshPhysicalMaterial {
  const cfg: GemConfig = GEM_CONFIGS[presetId];
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
    // No boost multiplier: that 1.25x was compensating for a flat environment. Against a
    // source-rich gem HDR it just blows the crown out to a white blob and kills facet read.
    // Gems sit on a near-white backdrop, so the environment has to push hard to produce
    // the near-blown facet highlights that read as "icy" rather than "grey glass".
    envMapIntensity: cfg.envMapIntensity * 2.1,
    attenuationColor: new THREE.Color(cfg.attenuationColor),
    attenuationDistance: cfg.attenuationDistance,
    specularIntensity: 1.0,
    specularColor: new THREE.Color(0xffffff),
    // Clearcoat adds a second, softer specular lobe over the facets. On a polished stone
    // that reads as haze and blunts the facet edges, so it stays off for gems.
    clearcoat: 0,
    clearcoatRoughness: 0,
    iridescence: cfg.iridescence ?? 0,
    iridescenceIOR: cfg.iridescence ? 1.3 : 1,
    // Raster transmission refracts the backdrop once; it never sees the stone's own back
    // facets, which is why a single-sided gem renders as a flat white shell. Drawing both
    // sides puts the pavilion facets behind the crown where the eye expects them, and that
    // criss-cross of bright and dark windows is what reads as a cut stone.
    side: THREE.DoubleSide,
    flatShading: false,
  });
  m.userData[GEM_GPU_USER_KEY] = presetId;

  // Transparent stones are ray-traced through their own facets; only translucent and
  // opaque stones (pearl, opal, onyx, cabochons) keep the surface-shaded path below.
  if (isGemTraceCandidate(cfg)) {
    const bounces = options.qualityReduce ? GEM_TRACE_BOUNCES.performance : GEM_TRACE_BOUNCES.standard;
    applyGemTrace(m, gemTraceParamsFromConfig(cfg, bounces));
    return m;
  }

  applyJewelryGemShader(m, {
    sparkleStrength: cfg.sparkleStrength ?? 1,
    fireStrength: 1,
    qualityReduce: options.qualityReduce ?? false,
    dispersionAmplitude: cfg.dispersionAmplitude,
  });

  return m;
}

export function createGemGpuDiamondMaterial(): THREE.MeshPhysicalMaterial {
  return createGemMaterial("diamond");
}

export function isGemGpuMaterial(
  m: THREE.Material,
): m is THREE.MeshPhysicalMaterial {
  if (!(m instanceof THREE.MeshPhysicalMaterial)) return false;
  const tag = m.userData[GEM_GPU_USER_KEY];
  return typeof tag === "string" || tag === true;
}

export const isGemGpuDiamondMaterial = isGemGpuMaterial;

export function gemPresetIdFromMaterial(
  m: THREE.MeshPhysicalMaterial,
): GemPresetId | null {
  const tag = m.userData[GEM_GPU_USER_KEY];
  if (typeof tag === "string") return tag as GemPresetId;
  if (tag === true) return "diamond";
  return null;
}
