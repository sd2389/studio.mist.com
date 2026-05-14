import * as THREE from "three";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { getFinishMaps } from "@/lib/finish-textures";
import type { FinishId, MaterialPresetId } from "@/stores/material-preset-store";

type MetalPresetId =
  | "gold-24k"
  | "gold-22k"
  | "gold-18k-yellow"
  | "gold-14k-yellow"
  | "gold-10k-yellow"
  | "gold-9k-yellow"
  | "gold-18k-white"
  | "gold-14k-white"
  | "gold-10k-white"
  | "platinum"
  | "silver-sterling"
  | "titanium"
  | "rhodium-black"
  | "gold-18k-rose"
  | "gold-14k-rose"
  | "gold-red"
  | "gold-red-light"
  | "gold-green"
  | "gold-grey"
  | "gold-sand"
  | "gold-warm";

type MetalSpec = {
  color: string;
  roughness: number;
  envMapIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
};

/**
 * F0 reflectance + jewelry-grade roughness. Karat steps in yellow gold get progressively
 * paler as the gold % drops (24K=99.9 → 10K=41.7). White gold is rhodium-plated in reality,
 * so it gets the highest clearcoat. Rose gold is copper-alloyed.
 */
const METAL_SPECS: Record<MetalPresetId, MetalSpec> = {
  "gold-24k": {
    color: "#FFC940",
    roughness: 0.1,
    envMapIntensity: 1.5,
    clearcoat: 0.5,
    clearcoatRoughness: 0.05,
  },
  "gold-22k": {
    color: "#FFC658",
    roughness: 0.11,
    envMapIntensity: 1.45,
    clearcoat: 0.45,
    clearcoatRoughness: 0.05,
  },
  "gold-18k-yellow": {
    color: "#F5D785",
    roughness: 0.13,
    envMapIntensity: 1.4,
    clearcoat: 0.4,
    clearcoatRoughness: 0.05,
  },
  "gold-18k-white": {
    color: "#E8E4DC",
    roughness: 0.12,
    envMapIntensity: 1.55,
    clearcoat: 0.85,
    clearcoatRoughness: 0.03,
  },
  "gold-18k-rose": {
    color: "#E8B3A5",
    roughness: 0.14,
    envMapIntensity: 1.4,
    clearcoat: 0.5,
    clearcoatRoughness: 0.04,
  },
  "gold-14k-yellow": {
    color: "#EDD09A",
    roughness: 0.15,
    envMapIntensity: 1.35,
    clearcoat: 0.4,
    clearcoatRoughness: 0.05,
  },
  "gold-14k-white": {
    color: "#E4E2DC",
    roughness: 0.13,
    envMapIntensity: 1.5,
    clearcoat: 0.85,
    clearcoatRoughness: 0.03,
  },
  "gold-14k-rose": {
    color: "#DDB4A6",
    roughness: 0.15,
    envMapIntensity: 1.35,
    clearcoat: 0.45,
    clearcoatRoughness: 0.04,
  },
  "gold-10k-yellow": {
    color: "#E0C895",
    roughness: 0.17,
    envMapIntensity: 1.3,
    clearcoat: 0.4,
    clearcoatRoughness: 0.06,
  },
  "gold-10k-white": {
    color: "#DDDCD8",
    roughness: 0.14,
    envMapIntensity: 1.45,
    clearcoat: 0.85,
    clearcoatRoughness: 0.04,
  },
  // 9K yellow — 37.5% Au, paler than 10K, slight greenish cast from higher Ag content
  "gold-9k-yellow": {
    color: "#DCBA80",
    roughness: 0.18,
    envMapIntensity: 1.28,
    clearcoat: 0.35,
    clearcoatRoughness: 0.06,
  },
  platinum: {
    color: "#D4D4D6",
    roughness: 0.18,
    envMapIntensity: 1.5,
    clearcoat: 0.6,
    clearcoatRoughness: 0.04,
  },
  "silver-sterling": {
    color: "#F1EFE7",
    roughness: 0.11,
    envMapIntensity: 1.55,
    clearcoat: 0.55,
    clearcoatRoughness: 0.03,
  },
  titanium: {
    color: "#8B847C",
    roughness: 0.32,
    envMapIntensity: 1.2,
    clearcoat: 0.2,
    clearcoatRoughness: 0.08,
  },
  // Black rhodium plating over silver/gold base — characteristic blue-black with mirror sheen
  "rhodium-black": {
    color: "#1F2024",
    roughness: 0.22,
    envMapIntensity: 1.1,
    clearcoat: 0.7,
    clearcoatRoughness: 0.05,
  },
  // Deep red gold (high-Cu, low-Ag alloy — Russian / Soviet tradition)
  "gold-red": {
    color: "#C97746",
    roughness: 0.14,
    envMapIntensity: 1.35,
    clearcoat: 0.45,
    clearcoatRoughness: 0.04,
  },
  // Light red gold — between rose and full red. Less copper than gold-red.
  "gold-red-light": {
    color: "#D89478",
    roughness: 0.14,
    envMapIntensity: 1.38,
    clearcoat: 0.45,
    clearcoatRoughness: 0.04,
  },
  // Green gold (Au-Ag electrum, no copper) — cool pale yellow with greenish undertone
  "gold-green": {
    color: "#D8D27D",
    roughness: 0.14,
    envMapIntensity: 1.35,
    clearcoat: 0.4,
    clearcoatRoughness: 0.05,
  },
  // Grey gold (Au + Pd or Au + Ni-Mn) — warm pewter tone, lower contrast than white gold
  "gold-grey": {
    color: "#BFB6A6",
    roughness: 0.17,
    envMapIntensity: 1.25,
    clearcoat: 0.45,
    clearcoatRoughness: 0.05,
  },
  // Sand gold — pale champagne, Cartier-style. Au-Ag-Cu with low saturation
  "gold-sand": {
    color: "#E9D9B8",
    roughness: 0.13,
    envMapIntensity: 1.38,
    clearcoat: 0.45,
    clearcoatRoughness: 0.04,
  },
  // Warm gold — rich orange-yellow, deeper than 18K yellow, less saturated than 22K
  "gold-warm": {
    color: "#E6B860",
    roughness: 0.13,
    envMapIntensity: 1.4,
    clearcoat: 0.45,
    clearcoatRoughness: 0.04,
  },
};

export function createPresetMaterial(
  preset: Exclude<MaterialPresetId, "original">,
  finish: FinishId = "polished",
): THREE.Material {
  if (isGemPresetId(preset)) {
    return createGemMaterial(preset);
  }

  const spec = METAL_SPECS[preset as MetalPresetId];
  const maps = getFinishMaps(finish);
  // Brushed / hammered finishes scatter highlights → reduce clearcoat so the
  // wet-polish sheen doesn't fight with the rough texture.
  const clearcoatScale = finish === "polished" || finish === "satin" ? 1 : 0.35;

  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.color),
    metalness: 1,
    roughness: Math.min(0.95, spec.roughness * maps.roughnessFactor),
    envMapIntensity: spec.envMapIntensity ?? 1,
    clearcoat: (spec.clearcoat ?? 0) * clearcoatScale,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0.05,
    roughnessMap: maps.roughnessMap,
    normalMap: maps.normalMap,
    normalScale: maps.normalMap ? new THREE.Vector2(maps.normalScale, maps.normalScale) : undefined,
  });
}
