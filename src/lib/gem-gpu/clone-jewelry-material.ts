import * as THREE from "three";
import { applyJewelryGemShader, enableJewelryGemSafeMode, JEWELRY_GEM_SHADER_KEY, setJewelryGemTime } from "./jewelry-gem-shader";

/** Material.copy does not copy custom TSL slots. Rebuild them with independent uniforms. */
export function cloneJewelryMaterial<T extends THREE.Material>(source: T): T {
  const clone = source.clone();
  if (source instanceof THREE.MeshPhysicalMaterial && clone instanceof THREE.MeshPhysicalMaterial && source.userData[JEWELRY_GEM_SHADER_KEY]) {
    const uniforms = source.userData.jewelryGemUniforms;
    applyJewelryGemShader(clone, {
      sparkleStrength: uniforms?.uSparkleStrength?.value ?? 1,
      fireStrength: uniforms?.uFireStrength?.value ?? 1,
      qualityReduce: source.userData.jewelryGemQualityReduce === true,
      dispersionAmplitude: uniforms?.uDispersionAmp?.value ?? 0.035,
    });
    if (source.userData.jewelryGemSafeMode === true) enableJewelryGemSafeMode(clone);
    setJewelryGemTime(clone, uniforms?.uTime?.value ?? 0);
  }
  return clone;
}
