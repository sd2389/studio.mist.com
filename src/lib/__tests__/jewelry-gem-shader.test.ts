import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyJewelryGemShader,
  enableJewelryGemSafeMode,
  isJewelryGemFragmentSource,
  JEWELRY_GEM_FRAGMENT_MARKER,
  JEWELRY_GEM_SHADER_KEY,
  setJewelryGemTime,
  type JewelryGemShaderOpts,
} from "@/lib/gem-gpu/jewelry-gem-shader";

function compileFragment(material: THREE.MeshPhysicalMaterial): string {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "",
    fragmentShader: `#include <common>
#include <lights_physical_fragment>
`,
  };
  material.onBeforeCompile?.(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader.fragmentShader;
}

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

  it("enableJewelryGemSafeMode keeps jewelry tag with a distinct simpler GLSL path", () => {
    const m = new THREE.MeshPhysicalMaterial();
    applyJewelryGemShader(m, {
      sparkleStrength: 1,
      fireStrength: 1,
      qualityReduce: false,
      dispersionAmplitude: 0.035,
    });
    const fullKey = m.customProgramCacheKey!();
    const fullFrag = compileFragment(m);
    expect(fullFrag).toMatch(/for\s*\(\s*int\s+i/);
    expect(fullFrag).toContain("uSparkleStrength");

    enableJewelryGemSafeMode(m);
    expect(m.userData[JEWELRY_GEM_SHADER_KEY]).toBe(true);
    expect(m.userData.jewelryGemSafeMode).toBe(true);
    expect(m.customProgramCacheKey!()).toBe("jewelry-gem-safe");
    expect(m.customProgramCacheKey!()).not.toBe(fullKey);

    const safeFrag = compileFragment(m);
    expect(safeFrag).toContain(JEWELRY_GEM_FRAGMENT_MARKER);
    expect(safeFrag).not.toMatch(/for\s*\(\s*int\s+i/);
    expect(safeFrag).not.toContain("uSparkleStrength");
    expect(safeFrag).toContain("uFireStrength");
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

describe("isJewelryGemFragmentSource", () => {
  // Compile-fallback bridge must gate on this before toast/safe-mode so
  // non-jewelry WebGL shader errors never degrade gem materials.
  it("returns true only for jewelry gem fragment markers", () => {
    expect(isJewelryGemFragmentSource(`uniform float uSparkleStrength;\n`)).toBe(true);
    expect(isJewelryGemFragmentSource(`// ${JEWELRY_GEM_FRAGMENT_MARKER}\nfloat fire = 1.0;`)).toBe(
      true,
    );
    expect(isJewelryGemFragmentSource("void main() { gl_FragColor = vec4(1.0); }")).toBe(false);
    expect(isJewelryGemFragmentSource(null)).toBe(false);
    expect(isJewelryGemFragmentSource(undefined)).toBe(false);
    expect(isJewelryGemFragmentSource("")).toBe(false);
  });
});
