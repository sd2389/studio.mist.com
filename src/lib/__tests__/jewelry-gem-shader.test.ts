import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyJewelryGemShader,
  enableJewelryGemSafeMode,
  JEWELRY_GEM_SHADER_KEY,
  setJewelryGemTime,
  type JewelryGemShaderOpts,
} from "@/lib/gem-gpu/jewelry-gem-shader";

describe("applyJewelryGemShader", () => {
  it("tags material userData and installs onBeforeCompile", () => {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1 });
    const opts: JewelryGemShaderOpts = {
      sparkleStrength: 1,
      fireStrength: 1,
      qualityReduce: false,
      dispersionAmplitude: 0.035,
    };
    applyJewelryGemShader(m, opts);
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(typeof m.onBeforeCompile).toBe("function");
    expect(m.customProgramCacheKey).toBeTypeOf("function");
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
  });

  it("enableJewelryGemSafeMode keeps jewelry tag with reduced quality", () => {
    const m = new THREE.MeshPhysicalMaterial();
    applyJewelryGemShader(m, {
      sparkleStrength: 1,
      fireStrength: 1,
      qualityReduce: false,
      dispersionAmplitude: 0.035,
    });
    enableJewelryGemSafeMode(m);
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(m.userData.jewelryGemQualityReduce).toBe(true);
    expect(m.userData.jewelryGemSafeMode).toBe(true);
    const uniforms = m.userData.jewelryGemUniforms as {
      uSparkleStrength: { value: number };
      uFireStrength: { value: number };
    };
    expect(uniforms.uSparkleStrength.value).toBe(0.35);
    expect(uniforms.uFireStrength.value).toBe(0.5);
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
