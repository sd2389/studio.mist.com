import * as THREE from "three";

export const JEWELRY_GEM_SHADER_KEY = "jewelryGemShader" as const;

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

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uSparkleStrength;
uniform float uFireStrength;
uniform float uDispersionAmp;
uniform float uQualityReduce;
uniform float uTime;`,
      )
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
{
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

export function setJewelryGemTime(material: THREE.Material, timeSec: number): void {
  const uniforms = material.userData.jewelryGemUniforms as JewelryUniforms | undefined;
  if (uniforms) uniforms.uTime.value = timeSec;
}

/**
 * Re-apply jewelry gem shader with reduced sparkle/fire after a WebGL compile failure.
 * Never falls back to silent stock glass — keeps the jewelry path with qualityReduce.
 */
export function enableJewelryGemSafeMode(material: THREE.MeshPhysicalMaterial): void {
  if (material.userData.jewelryGemSafeMode === true) return;

  applyJewelryGemShader(material, {
    sparkleStrength: 0.35,
    fireStrength: 0.5,
    qualityReduce: true,
    dispersionAmplitude: 0.02,
  });
  material.userData.jewelryGemSafeMode = true;
}
