import * as THREE from "three";
import { getFinishMaps } from "@/lib/finish-textures";
import { GEM_GPU_USER_KEY } from "@/lib/gem-gpu/gem-physical-material";
import { applyJewelryGemShader } from "@/lib/gem-gpu/jewelry-gem-shader";
import type { FinishId } from "@/stores/material-preset-store";
import type { UserMaterialItem } from "@/lib/library/types";

export function createMetalMaterialFromParams(
  params: Record<string, unknown>,
  finishOverride?: FinishId,
): THREE.MeshPhysicalMaterial {
  const finish =
    finishOverride ??
    (typeof params.finish === "string" ? (params.finish as FinishId) : "polished");
  const color = typeof params.color === "string" ? params.color : "#EDD09A";
  const roughness = typeof params.roughness === "number" ? params.roughness : 0.15;
  const envMapIntensity = typeof params.envMapIntensity === "number" ? params.envMapIntensity : 1.35;
  const clearcoat = typeof params.clearcoat === "number" ? params.clearcoat : 0.4;
  const clearcoatRoughness =
    typeof params.clearcoatRoughness === "number" ? params.clearcoatRoughness : 0.05;
  const metalness = typeof params.metalness === "number" ? params.metalness : 1;

  const maps = getFinishMaps(finish);
  const clearcoatScale = finish === "polished" || finish === "satin" ? 1 : 0.35;

  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness,
    roughness: Math.min(0.95, roughness * maps.roughnessFactor),
    envMapIntensity,
    clearcoat: clearcoat * clearcoatScale,
    clearcoatRoughness,
    roughnessMap: maps.roughnessMap,
    normalMap: maps.normalMap,
    normalScale: maps.normalMap ? new THREE.Vector2(maps.normalScale, maps.normalScale) : undefined,
  });
}

export function createGemMaterialFromParams(
  params: Record<string, unknown>,
  qualityReduce = false,
): THREE.MeshPhysicalMaterial {
  const baseColor = typeof params.baseColor === "string" ? params.baseColor : "#FFFFFF";
  const attenuationColor =
    typeof params.attenuationColor === "string" ? params.attenuationColor : baseColor;
  const transmission = typeof params.transmission === "number" ? params.transmission : 1;

  const m = new THREE.MeshPhysicalMaterial({
    name: "CustomGem",
    color: new THREE.Color(baseColor),
    metalness: 0,
    roughness: typeof params.roughness === "number" ? params.roughness : 0.02,
    transmission,
    thickness: typeof params.thickness === "number" ? params.thickness : 0.55,
    ior: typeof params.ior === "number" ? params.ior : 2.417,
    dispersion: typeof params.dispersionBase === "number" ? params.dispersionBase : 0.08,
    transparent: transmission > 0,
    envMapIntensity: (typeof params.envMapIntensity === "number" ? params.envMapIntensity : 1.6) * 1.25,
    attenuationColor: new THREE.Color(attenuationColor),
    attenuationDistance:
      typeof params.attenuationDistance === "number" ? params.attenuationDistance : 0.45,
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    reflectivity: 0.6,
    clearcoat: typeof params.clearcoat === "number" ? params.clearcoat : 0.6,
    clearcoatRoughness: typeof params.clearcoat === "number" ? 0.02 : 0,
    iridescence: typeof params.iridescence === "number" ? params.iridescence : 0,
    iridescenceIOR: typeof params.iridescence === "number" ? 1.3 : 1,
  });

  m.userData[GEM_GPU_USER_KEY] = true;
  applyJewelryGemShader(m, {
    sparkleStrength: typeof params.sparkleStrength === "number" ? params.sparkleStrength : 1,
    fireStrength: 1,
    qualityReduce,
    dispersionAmplitude:
      typeof params.dispersionAmplitude === "number" ? params.dispersionAmplitude : 0.035,
  });
  return m;
}

export function createMaterialFromUserItem(item: UserMaterialItem): THREE.Material {
  if (item.kind === "gem") return createGemMaterialFromParams(item.params);
  const finish =
    typeof item.params.finish === "string" ? (item.params.finish as FinishId) : undefined;
  return createMetalMaterialFromParams(item.params, finish);
}

/** Adapt a user material row to the catalog tile shape for reuse in swatch grids. */
export function userMaterialAsCatalogItem(item: UserMaterialItem) {
  return {
    slug: item.slug,
    label: item.label,
    params: item.params,
    sort_weight: item.sort_weight,
    swatch_url: item.swatch_url,
  };
}
