import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyJewelryGemShader,
  JEWELRY_GEM_SHADER_KEY,
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
});
