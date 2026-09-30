import * as THREE from "three";
import {
  Fn,
  If,
  Loop,
  cos,
  dot,
  float,
  int,
  max,
  mix,
  normalize,
  normalView,
  positionViewDirection,
  pow,
  sin,
  uniform,
  vec3,
} from "three/tsl";

export const JEWELRY_GEM_SHADER_KEY = "jewelryGemShader" as const;

export type JewelryGemShaderOpts = {
  sparkleStrength: number;
  fireStrength: number;
  qualityReduce: boolean;
  dispersionAmplitude: number;
};

function jewelryUniform(value: number) {
  return uniform(value);
}

type JewelryUniform = ReturnType<typeof jewelryUniform>;

export type JewelryUniforms = {
  uSparkleStrength: JewelryUniform;
  uFireStrength: JewelryUniform;
  uDispersionAmp: JewelryUniform;
  uQualityReduce: JewelryUniform;
  uTime: JewelryUniform;
};

type JewelrySafeUniforms = {
  uFireStrength: JewelryUniform;
  uTime: JewelryUniform;
};

function jewelryViewTerms() {
  const n = normalize(normalView);
  const v = normalize(positionViewDirection);
  const ndv = max(dot(n, v), float(0));
  return { n, v, ndv };
}

/**
 * Facet flash as a *reflection* term.
 *
 * This used to be added to `emissiveNode`. On a transmissive gem that injects light
 * the surface never received, which flattens every facet toward white — the "milky
 * glass ball" failure. Driving `specularIntensity` instead makes bright facets bright
 * by reflecting more environment, so dark facets stay dark and the stone keeps the
 * light/dark contrast that reads as brilliance.
 */
function createJewelrySpecularNode(u: JewelryUniforms, baseSpecular: number) {
  return Fn(() => {
    const { n, v, ndv } = jewelryViewTerms();
    const internalLobe = mix(float(0.35), float(0.12), u.uQualityReduce).mul(
      pow(ndv.oneMinus(), float(3)),
    );

    const sparkleTaps = mix(float(4), float(1), u.uQualityReduce);
    const sparkle = float(0).toVar();
    Loop({ start: int(0), end: int(4), type: "int", condition: "<" }, ({ i }) => {
      If(float(i).lessThan(sparkleTaps), () => {
        const ang = float(i).mul(1.5707963).add(u.uTime.mul(0.15));
        const jitterN = normalize(
          n.add(vec3(cos(ang), sin(ang.mul(1.3)), cos(ang.mul(0.7))).mul(0.04)),
        );
        sparkle.addAssign(pow(max(dot(jitterN, v), float(0)), float(64)));
      });
    });
    const sparkleOut = sparkle.div(max(sparkleTaps, float(1))).mul(u.uSparkleStrength);

    return float(baseSpecular).add(internalLobe).add(sparkleOut.mul(0.6));
  })();
}

/** Chromatic fire, tinting what the facet reflects rather than adding light. */
function createJewelryFireColorNode(u: JewelryUniforms) {
  return Fn(() => {
    const { ndv } = jewelryViewTerms();
    const facet = pow(ndv.oneMinus(), float(2)).mul(u.uFireStrength);
    const tint = vec3(
      float(1).add(u.uDispersionAmp.mul(2)),
      float(1),
      float(1).sub(u.uDispersionAmp),
    );
    return mix(vec3(1, 1, 1), tint, facet);
  })();
}

function createJewelrySafeSpecularNode(baseSpecular: number) {
  return Fn(() => {
    const { ndv } = jewelryViewTerms();
    const internalLobe = float(0.12).mul(pow(ndv.oneMinus(), float(3)));
    return float(baseSpecular).add(internalLobe);
  })();
}

function createJewelrySafeFireColorNode(u: JewelrySafeUniforms) {
  return Fn(() => {
    const { ndv } = jewelryViewTerms();
    const facet = pow(ndv.oneMinus(), float(2)).mul(u.uFireStrength);
    return mix(vec3(1, 1, 1), vec3(1.2, 1, 0.85), facet);
  })();
}

type SpecularNode = ReturnType<typeof createJewelrySpecularNode>;
type FireColorNode = ReturnType<typeof createJewelryFireColorNode>;

function attachJewelryNodes(
  material: THREE.MeshPhysicalMaterial,
  specularNode: SpecularNode | ReturnType<typeof createJewelrySafeSpecularNode>,
  fireColorNode: FireColorNode | ReturnType<typeof createJewelrySafeFireColorNode>,
): void {
  material.specularIntensityNode = specularNode;
  material.specularColorNode = fireColorNode;
  material.needsUpdate = true;
}

/**
 * Facet-aware sparkle + chromatic fire on MeshPhysicalMaterial via TSL.
 * WebGPURenderer maps this onto MeshPhysicalNodeMaterial; GLSL onBeforeCompile
 * is not available on the WebGPU path.
 */
export function applyJewelryGemShader(
  material: THREE.MeshPhysicalMaterial,
  opts: JewelryGemShaderOpts,
): void {
  const uniforms: JewelryUniforms = {
    uSparkleStrength: jewelryUniform(opts.sparkleStrength),
    uFireStrength: jewelryUniform(opts.fireStrength),
    uDispersionAmp: jewelryUniform(opts.dispersionAmplitude),
    uQualityReduce: jewelryUniform(opts.qualityReduce ? 1 : 0),
    uTime: jewelryUniform(0),
  };

  material.userData[JEWELRY_GEM_SHADER_KEY] = true;
  material.userData.jewelryGemQualityReduce = opts.qualityReduce;
  material.userData.jewelryGemUniforms = uniforms;
  material.userData.jewelryGemSafeMode = false;
  material.userData.jewelryGemPath = opts.qualityReduce ? "perf" : "full";

  attachJewelryNodes(
    material,
    createJewelrySpecularNode(uniforms, material.specularIntensity),
    createJewelryFireColorNode(uniforms),
  );
}

function applyJewelryGemSafeShader(material: THREE.MeshPhysicalMaterial): void {
  const uniforms: JewelrySafeUniforms = {
    uFireStrength: jewelryUniform(0.5),
    uTime: jewelryUniform(0),
  };

  material.userData[JEWELRY_GEM_SHADER_KEY] = true;
  material.userData.jewelryGemQualityReduce = true;
  material.userData.jewelryGemUniforms = uniforms;
  material.userData.jewelryGemSafeMode = true;
  material.userData.jewelryGemPath = "safe";

  attachJewelryNodes(
    material,
    createJewelrySafeSpecularNode(material.specularIntensity),
    createJewelrySafeFireColorNode(uniforms),
  );
}

export function setJewelryGemTime(material: THREE.Material, timeSec: number): void {
  const uniforms = material.userData.jewelryGemUniforms as
    | { uTime?: { value: number } }
    | undefined;
  if (uniforms?.uTime) uniforms.uTime.value = timeSec;
}

/**
 * Switch to a simpler TSL jewelry path after a WebGPU compile failure.
 * Never falls back to silent stock glass — keeps JEWELRY_GEM_SHADER_KEY.
 */
export function enableJewelryGemSafeMode(material: THREE.MeshPhysicalMaterial): void {
  if (material.userData.jewelryGemSafeMode === true) return;
  applyJewelryGemSafeShader(material);
}
