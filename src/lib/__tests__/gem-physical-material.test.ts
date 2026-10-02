import { describe, expect, it } from "vitest";
import {
  createGemMaterial,
  GEM_GPU_USER_KEY,
  gemPresetIdFromMaterial,
  isGemGpuMaterial,
} from "@/lib/gem-gpu/gem-physical-material";
import { JEWELRY_GEM_SHADER_KEY } from "@/lib/gem-gpu/jewelry-gem-shader";
import { GEM_CONFIGS, GEM_PRESET_IDS } from "@/lib/gem-gpu/gem-configs";
import {
  GEM_TRACE_BOUNCES,
  getGemTraceUniforms,
  isGemTraceCandidate,
  isGemTraceMaterial,
} from "@/lib/gem-gpu/gem-trace-material";
import { createGemMaterialFromParams } from "@/lib/library/create-material-from-params";

const SAMPLE_IDS = [
  "diamond",
  "moissanite",
  "ruby",
  "sapphire",
  "emerald",
  "pearl",
] as const;

const CLEAR_DIAMOND_PARAMS = {
  baseColor: "#ffffff",
  ior: 2.417,
  dispersionBase: 0.08,
  roughness: 0.02,
  thickness: 0.55,
  envMapIntensity: 1.6,
  attenuationColor: "#ffffff",
  attenuationDistance: 0.4,
};

describe("createGemMaterial", () => {
  it("tags every preset and ray-traces only the transparent ones", () => {
    for (const id of SAMPLE_IDS) {
      expect(GEM_PRESET_IDS.includes(id)).toBe(true);
      const m = createGemMaterial(id);
      expect(isGemGpuMaterial(m)).toBe(true);
      expect(m.userData[GEM_GPU_USER_KEY]).toBe(id);
      expect(gemPresetIdFromMaterial(m)).toBe(id);
      if (isGemTraceCandidate(GEM_CONFIGS[id])) {
        expect(isGemTraceMaterial(m)).toBe(true);
        // The trace refracts itself; leaving raster transmission on would add a render pass.
        expect(m.transmission).toBe(0);
        expect((m as unknown as { outputNode: unknown }).outputNode).toBeTruthy();
      } else {
        expect(isGemTraceMaterial(m)).toBe(false);
        expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
      }
      m.dispose();
    }
  });

  it("gives each traced material its own shader identity", () => {
    const ruby = createGemMaterial("ruby");
    const sapphire = createGemMaterial("sapphire");
    expect(ruby.customProgramCacheKey()).not.toBe(sapphire.customProgramCacheKey());
  });

  it("traces fewer bounces in the reduced-quality path", () => {
    const m = createGemMaterial("diamond", { qualityReduce: true });
    expect(isGemGpuMaterial(m)).toBe(true);
    expect(getGemTraceUniforms(m)?.bounces.value).toBe(GEM_TRACE_BOUNCES.performance);
    m.dispose();
  });
});

describe("createGemMaterialFromParams", () => {
  it("ray-traces a transparent custom gem", () => {
    const m = createGemMaterialFromParams(CLEAR_DIAMOND_PARAMS);
    expect(isGemTraceMaterial(m)).toBe(true);
    expect(getGemTraceUniforms(m)?.bounces.value).toBe(GEM_TRACE_BOUNCES.standard);
    m.dispose();
  });

  it("threads qualityReduce into the trace bounce count", () => {
    const m = createGemMaterialFromParams(CLEAR_DIAMOND_PARAMS, true);
    expect(getGemTraceUniforms(m)?.bounces.value).toBe(GEM_TRACE_BOUNCES.performance);
    m.dispose();
  });

  it("keeps translucent custom gems on the surface-shaded path", () => {
    const m = createGemMaterialFromParams({ ...CLEAR_DIAMOND_PARAMS, transmission: 0.2 }, true);
    expect(isGemTraceMaterial(m)).toBe(false);
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(m.userData.jewelryGemQualityReduce).toBe(true);
    m.dispose();
  });
});
