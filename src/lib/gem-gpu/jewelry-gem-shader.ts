import * as THREE from "three";

export const JEWELRY_GEM_SHADER_KEY = "jewelryGemShader" as const;

/** Distinctive fragment marker — compile fallback gates on this / uSparkleStrength. */
export const JEWELRY_GEM_FRAGMENT_MARKER = "JEWELRY_GEM_SHADER" as const;

export type JewelryGemShaderOpts = {
  sparkleStrength: number;
  fireStrength: number;
  qualityReduce: boolean;
  dispersionAmplitude: number;
};

type JewelryUniforms = {
  uSparkleStrength: { value: number };
  uFireStrength: { value: number };
  uDispersionAmp: { value: number };
  uQualityReduce: { value: number };
  uTime: { value: number };
};

type JewelrySafeUniforms = {
  uFireStrength: { value: number };
  uTime: { value: number };
};

/**
 * True when a compiled fragment source belongs to the jewelry gem path.
 * Used by JewelryGemCompileFallbackBridge so non-gem WebGL errors never
 * toast or force gem safe-mode.
 */
export function isJewelryGemFragmentSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return (
    source.includes(JEWELRY_GEM_FRAGMENT_MARKER) || source.includes("uSparkleStrength")
  );
}

function injectJewelryUniformsBlock(fragmentShader: string, uniformsGlsl: string): string {
  return fragmentShader.replace(
    "#include <common>",
    `#include <common>
${uniformsGlsl}`,
  );
}

/**
 * Inject facet-aware sparkle + chromatic fire into MeshPhysicalMaterial.
 * Cap: env sparkle + fire lobes + one internal Fresnel boost — no path tracer.
 */
export function applyJewelryGemShader(
  material: THREE.MeshPhysicalMaterial,
  opts: JewelryGemShaderOpts,
): void {
  const uniforms: JewelryUniforms = {
    uSparkleStrength: { value: opts.sparkleStrength },
    uFireStrength: { value: opts.fireStrength },
    uDispersionAmp: { value: opts.dispersionAmplitude },
    uQualityReduce: { value: opts.qualityReduce ? 1 : 0 },
    uTime: { value: 0 },
  };

  material.userData[JEWELRY_GEM_SHADER_KEY] = true;
  material.userData.jewelryGemQualityReduce = opts.qualityReduce;
  material.userData.jewelryGemUniforms = uniforms;
  material.userData.jewelryGemSafeMode = false;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.fragmentShader = injectJewelryUniformsBlock(
      shader.fragmentShader,
      `uniform float uSparkleStrength;
uniform float uFireStrength;
uniform float uDispersionAmp;
uniform float uQualityReduce;
uniform float uTime;`,
    ).replace(
      "#include <lights_physical_fragment>",
      `#include <lights_physical_fragment>
{
  // ${JEWELRY_GEM_FRAGMENT_MARKER}
  // Facet flash: sharpen specular when normal is discontinuous vs view
  vec3 n = normalize(geometryNormal);
  vec3 v = normalize(geometryViewDir);
  float ndv = max(dot(n, v), 0.0);
  float facet = pow(1.0 - ndv, 2.0);

  float sparkleTaps = mix(4.0, 1.0, uQualityReduce);
  float sparkle = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= sparkleTaps) break;
    float ang = float(i) * 1.5707963 + uTime * 0.15;
    vec3 jitterN = normalize(n + 0.04 * vec3(cos(ang), sin(ang * 1.3), cos(ang * 0.7)));
    sparkle += pow(max(dot(jitterN, v), 0.0), 64.0);
  }
  sparkle = (sparkle / max(sparkleTaps, 1.0)) * uSparkleStrength;

  // Fire: cheap RGB-split specular lobe (not full spectral path)
  float fire = facet * uFireStrength;
  vec3 fireRgb = vec3(
    fire * (1.0 + uDispersionAmp * 2.0),
    fire,
    fire * (1.0 - uDispersionAmp)
  );

  // Internal lobe: Fresnel-ish boost into outgoing light
  float internalLobe = mix(0.35, 0.12, uQualityReduce) * pow(1.0 - ndv, 3.0);

  totalEmissiveRadiance += fireRgb * 0.25 + vec3(sparkle) * 0.4;
  material.specularIntensity += internalLobe;
}`,
    );
  };

  material.customProgramCacheKey = () =>
    `jewelry-gem-${opts.qualityReduce ? "perf" : "full"}-${opts.sparkleStrength.toFixed(2)}`;

  material.needsUpdate = true;
}

/**
 * Simpler jewelry fragment path for WebGL compile recovery: Fresnel/fire only,
 * no sparkle for-loop. Distinct cache key so Three recompiles a different program.
 * Never falls back to silent stock glass — keeps JEWELRY_GEM_SHADER_KEY.
 */
function applyJewelryGemSafeShader(material: THREE.MeshPhysicalMaterial): void {
  const uniforms: JewelrySafeUniforms = {
    uFireStrength: { value: 0.5 },
    uTime: { value: 0 },
  };

  material.userData[JEWELRY_GEM_SHADER_KEY] = true;
  material.userData.jewelryGemQualityReduce = true;
  material.userData.jewelryGemUniforms = uniforms;
  material.userData.jewelryGemSafeMode = true;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.fragmentShader = injectJewelryUniformsBlock(
      shader.fragmentShader,
      `uniform float uFireStrength;
uniform float uTime;`,
    ).replace(
      "#include <lights_physical_fragment>",
      `#include <lights_physical_fragment>
{
  // ${JEWELRY_GEM_FRAGMENT_MARKER} (safe)
  // Minimal Fresnel/fire boost — no sparkle loop (compile-recovery path)
  vec3 n = normalize(geometryNormal);
  vec3 v = normalize(geometryViewDir);
  float ndv = max(dot(n, v), 0.0);
  float facet = pow(1.0 - ndv, 2.0);
  float fire = facet * uFireStrength;
  vec3 fireRgb = vec3(fire * 1.2, fire, fire * 0.85);
  float internalLobe = 0.12 * pow(1.0 - ndv, 3.0);
  totalEmissiveRadiance += fireRgb * 0.2;
  material.specularIntensity += internalLobe;
}`,
    );
  };

  material.customProgramCacheKey = () => "jewelry-gem-safe";
  material.needsUpdate = true;
}

export function setJewelryGemTime(material: THREE.Material, timeSec: number): void {
  const uniforms = material.userData.jewelryGemUniforms as
    | { uTime?: { value: number } }
    | undefined;
  if (uniforms?.uTime) uniforms.uTime.value = timeSec;
}

/**
 * Switch to a simpler jewelry GLSL path after a WebGL compile failure.
 * Never falls back to silent stock glass — keeps the jewelry marker + safe cache key.
 */
export function enableJewelryGemSafeMode(material: THREE.MeshPhysicalMaterial): void {
  if (material.userData.jewelryGemSafeMode === true) return;
  applyJewelryGemSafeShader(material);
}
