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

type PhysicalNodeSlots = THREE.MeshPhysicalMaterial & {
  emissiveNode: ReturnType<typeof createJewelryEmissiveNode> | ReturnType<typeof createJewelrySafeEmissiveNode>;
  specularIntensityNode: ReturnType<typeof createJewelrySpecularNode> | ReturnType<typeof createJewelrySafeSpecularNode>;
};

function asNodeSlots(material: THREE.MeshPhysicalMaterial): PhysicalNodeSlots {
  return material as PhysicalNodeSlots;
}

function jewelryViewTerms() {
  const n = normalize(normalView);
  const v = normalize(positionViewDirection);
  const ndv = max(dot(n, v), float(0));
  return { n, v, ndv };
}

function createJewelryEmissiveNode(u: JewelryUniforms) {
  return Fn(() => {
    const { n, v, ndv } = jewelryViewTerms();
    const facet = pow(ndv.oneMinus(), float(2));
    const fire = facet.mul(u.uFireStrength);
    const fireRgb = vec3(
      fire.mul(float(1).add(u.uDispersionAmp.mul(2))),
      fire,
      fire.mul(float(1).sub(u.uDispersionAmp)),
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
    return fireRgb.mul(0.25).add(vec3(sparkleOut).mul(0.4));
  })();
}

function createJewelrySpecularNode(u: JewelryUniforms, baseSpecular: number) {
  return Fn(() => {
    const { ndv } = jewelryViewTerms();
    const internalLobe = mix(float(0.35), float(0.12), u.uQualityReduce).mul(
      pow(ndv.oneMinus(), float(3)),
    );
    return float(baseSpecular).add(internalLobe);
  })();
}

function createJewelrySafeEmissiveNode(u: JewelrySafeUniforms) {
  return Fn(() => {
    const { ndv } = jewelryViewTerms();
    const facet = pow(ndv.oneMinus(), float(2));
    const fire = facet.mul(u.uFireStrength);
    const fireRgb = vec3(fire.mul(1.2), fire, fire.mul(0.85));
    return fireRgb.mul(0.2);
  })();
}

function createJewelrySafeSpecularNode(baseSpecular: number) {
  return Fn(() => {
    const { ndv } = jewelryViewTerms();
    const internalLobe = float(0.12).mul(pow(ndv.oneMinus(), float(3)));
    return float(baseSpecular).add(internalLobe);
  })();
}

function attachJewelryNodes(
  material: THREE.MeshPhysicalMaterial,
  emissiveNode: ReturnType<typeof createJewelryEmissiveNode> | ReturnType<typeof createJewelrySafeEmissiveNode>,
  specularNode: ReturnType<typeof createJewelrySpecularNode> | ReturnType<typeof createJewelrySafeSpecularNode>,
): void {
  const slots = asNodeSlots(material);
  slots.emissiveNode = emissiveNode;
  slots.specularIntensityNode = specularNode;
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
    createJewelryEmissiveNode(uniforms),
    createJewelrySpecularNode(uniforms, material.specularIntensity),
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
    createJewelrySafeEmissiveNode(uniforms),
    createJewelrySafeSpecularNode(material.specularIntensity),
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
