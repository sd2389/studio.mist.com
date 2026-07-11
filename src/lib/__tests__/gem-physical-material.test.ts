import { describe, expect, it } from "vitest";
import {
  createGemMaterial,
  GEM_GPU_USER_KEY,
  gemPresetIdFromMaterial,
  isGemGpuMaterial,
} from "@/lib/gem-gpu/gem-physical-material";
import { JEWELRY_GEM_SHADER_KEY } from "@/lib/gem-gpu/jewelry-gem-shader";
import { GEM_PRESET_IDS } from "@/lib/gem-gpu/gem-configs";
import { createGemMaterialFromParams } from "@/lib/library/create-material-from-params";

const SAMPLE_IDS = [
  "diamond",
  "moissanite",
  "ruby",
  "sapphire",
  "emerald",
  "pearl",
] as const;

describe("createGemMaterial", () => {
  it("tags GEM_GPU_USER_KEY and jewelry shader for sample presets", () => {
    for (const id of SAMPLE_IDS) {
      expect(GEM_PRESET_IDS.includes(id)).toBe(true);
      const m = createGemMaterial(id);
      expect(isGemGpuMaterial(m)).toBe(true);
      expect(m.userData[GEM_GPU_USER_KEY]).toBe(id);
      expect(gemPresetIdFromMaterial(m)).toBe(id);
      expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
      m.dispose();
    }
  });

  it("accepts qualityReduce option without dropping tags", () => {
    const m = createGemMaterial("diamond", { qualityReduce: true });
    expect(isGemGpuMaterial(m)).toBe(true);
    expect(m.userData.jewelryGemQualityReduce).toBe(true);
    m.dispose();
  });
});

describe("createGemMaterialFromParams", () => {
  it("produces a jewelry-tagged gem material from ad-hoc params", () => {
    const m = createGemMaterialFromParams({
      baseColor: "#ffffff",
      ior: 2.417,
      dispersionBase: 0.08,
      roughness: 0.02,
      thickness: 0.55,
      envMapIntensity: 1.6,
      attenuationColor: "#ffffff",
      attenuationDistance: 0.4,
    });
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    m.dispose();
  });
});
