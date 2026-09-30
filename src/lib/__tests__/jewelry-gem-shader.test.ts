import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyJewelryGemShader,
  enableJewelryGemSafeMode,
  JEWELRY_GEM_SHADER_KEY,
  setJewelryGemTime,
  type JewelryGemShaderOpts,
} from "@/lib/gem-gpu/jewelry-gem-shader";

function nodeSlots(material: THREE.MeshPhysicalMaterial) {
  return material;
}

describe("applyJewelryGemShader", () => {
  it("tags material userData and installs TSL node slots", () => {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1 });
    const opts: JewelryGemShaderOpts = {
      sparkleStrength: 1,
      fireStrength: 1,
      qualityReduce: false,
      dispersionAmplitude: 0.035,
    };
    applyJewelryGemShader(m, opts);
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(nodeSlots(m).specularIntensityNode).toBeTruthy();
    expect(nodeSlots(m).specularColorNode).toBeTruthy();
    // Facet flash drives reflection, never emission — an emissive gem reads milky.
    expect(nodeSlots(m).emissiveNode).toBeFalsy();
    expect(m.userData.jewelryGemPath).toBe("full");
    expect(m.userData.jewelryGemSafeMode).toBe(false);
  });

  it("sets qualityReduce uniform path without removing jewelry tag", () => {
    const m = new THREE.MeshPhysicalMaterial();
    applyJewelryGemShader(m, {
      sparkleStrength: 0.8,
      fireStrength: 1,
      qualityReduce: true,
      dispersionAmplitude: 0.02,
    });
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(m.userData.jewelryGemQualityReduce).toBe(true);
    expect(m.userData.jewelryGemPath).toBe("perf");
  });

  it("enableJewelryGemSafeMode keeps jewelry tag with a distinct simpler TSL path", () => {
    const m = new THREE.MeshPhysicalMaterial();
    applyJewelryGemShader(m, {
      sparkleStrength: 1,
      fireStrength: 1,
      qualityReduce: false,
      dispersionAmplitude: 0.035,
    });
    const fullSpecular = nodeSlots(m).specularIntensityNode;
    const fullPath = m.userData.jewelryGemPath;

    enableJewelryGemSafeMode(m);
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(m.userData.jewelryGemSafeMode).toBe(true);
    expect(m.userData.jewelryGemPath).toBe("safe");
    expect(m.userData.jewelryGemPath).not.toBe(fullPath);
    expect(nodeSlots(m).specularIntensityNode).toBeTruthy();
    expect(nodeSlots(m).specularIntensityNode).not.toBe(fullSpecular);
    expect(nodeSlots(m).emissiveNode).toBeFalsy();
    expect(m.userData.jewelryGemUniforms.uFireStrength).toBeTruthy();
    expect(m.userData.jewelryGemUniforms.uSparkleStrength).toBeUndefined();
  });

  it("setJewelryGemTime updates uTime on tagged materials", () => {
    const m = new THREE.MeshPhysicalMaterial();
    applyJewelryGemShader(m, {
      sparkleStrength: 1,
      fireStrength: 1,
      qualityReduce: false,
      dispersionAmplitude: 0.035,
    });
    setJewelryGemTime(m, 12.5);
    const uniforms = m.userData.jewelryGemUniforms as { uTime: { value: number } };
    expect(uniforms.uTime.value).toBe(12.5);
  });
});
