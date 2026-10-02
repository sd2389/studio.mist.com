import * as THREE from "three";
import { uniform, vec4 } from "three/tsl";
import type { GemConfig } from "./gem-configs";
import { ensureFacetedGemNormalsOnMesh } from "./ensure-faceted-gem-normals";
import { absorptionFromAttenuation } from "./gem-absorption";
import { hasGemTraceRows, registerGemTraceGeometry } from "./gem-trace-atlas";
import { getGemStudioEnvironment } from "./gem-studio-environment";
import {
  createGemTraceOutputNode,
  createGemTraceUniforms,
  type GemTraceParams,
  type GemTraceUniforms,
} from "./gem-trace-shader";

/** userData key holding the plain-JSON trace params, so `Material.clone()` carries them. */
export const GEM_TRACE_KEY = "gemTrace" as const;

export const GEM_TRACE_BOUNCES = { performance: 3, standard: 6, photometric: 9 } as const;

/**
 * Fire is rendered at the gemmological dispersion, unboosted: what the stone shows is what
 * the real stone would show under the same light. Visible fire comes from the tent's
 * pinpoint sources, not from exaggerating the spread.
 */
const FIRE_BOOST = 1;

/** Stones below this transmission (pearl, opal, onyx, cabochons) keep the surface-shaded path. */
const MIN_TRACE_TRANSMISSION = 0.9;

const uniformsByMaterial = new WeakMap<THREE.Material, GemTraceUniforms>();

type NodeSlots = { outputNode?: unknown };

export function isGemTraceCandidate(cfg: GemConfig): boolean {
  return (cfg.transmission ?? 1) >= MIN_TRACE_TRANSMISSION;
}

/**
 * `dispersionBase` was tuned ≈1.8× the gemmological B–G dispersion for three's raster
 * dispersion, so 0.55× recovers the physical spread (diamond 0.08 → 0.044).
 */
export function gemTraceParamsFromConfig(cfg: GemConfig, bounces: number): GemTraceParams {
  const spread = cfg.dispersionBase * 0.55 * FIRE_BOOST;
  return {
    // Red bends least and violet most; the reference index sits near the yellow D line.
    ior: [cfg.ior - spread * 0.4, cfg.ior, cfg.ior + spread * 0.6],
    absorption: absorptionFromAttenuation(cfg.attenuationColor, cfg.attenuationDistance),
    bounces,
  };
}

export function isGemTraceMaterial(material: THREE.Material): boolean {
  return uniformsByMaterial.has(material);
}

export function getGemTraceUniforms(material: THREE.Material): GemTraceUniforms | null {
  return uniformsByMaterial.get(material) ?? null;
}

/**
 * Faceted normals first (the entry facet is read from them), then atlas rows. Geometry that
 * already carries live rows (a clone of a prepared stone) is only counted as a user of them.
 */
export function prepareGemTraceMesh(mesh: THREE.Mesh): void {
  if (!hasGemTraceRows(mesh.geometry)) ensureFacetedGemNormalsOnMesh(mesh);
  registerGemTraceGeometry(mesh.geometry);
}

/**
 * Safety net for meshes that received a traced material without `prepareGemTraceMesh`:
 * prepare them on first draw and rebuild the material next frame. Costs one frame of the
 * untraced fallback, never a wrong stone.
 */
function createMeshPreparer(material: THREE.Material) {
  return uniform(0).onObjectUpdate(({ object }) => {
    if (!(object instanceof THREE.Mesh)) return;
    const hadRows = hasGemTraceRows(object.geometry);
    prepareGemTraceMesh(object);
    if (!hadRows) material.needsUpdate = true;
  });
}

/**
 * Turn a gem `MeshPhysicalMaterial` into a ray-traced stone. The material stays a
 * `MeshPhysicalMaterial` (callers and the WebGPU node conversion rely on that); its output
 * is replaced, and transmission is switched off because the trace already refracts —
 * leaving it on would also make the renderer draw an extra transmission pass.
 */
export function applyGemTrace(material: THREE.MeshPhysicalMaterial, params: GemTraceParams): void {
  const uniforms = createGemTraceUniforms(params);
  const preparer = createMeshPreparer(material);
  material.transmission = 0;
  material.transparent = false;
  material.depthWrite = true;
  material.side = THREE.FrontSide;
  const outputNode = createGemTraceOutputNode(uniforms).add(vec4(preparer));
  (material as NodeSlots).outputNode = outputNode;
  // The WebGPU renderer keys a non-node material's shader state on generic property flags,
  // where every node slot hashes to the same "{}". Without an identity here, all traced
  // gems would share whichever gem compiled first — uniforms included.
  material.customProgramCacheKey = () => `gem-trace-${outputNode.id}`;
  material.userData[GEM_TRACE_KEY] = params;
  uniformsByMaterial.set(material, uniforms);
  material.needsUpdate = true;
}

/** Re-apply tracing on a clone; `clone()` copies the params but not the node graph. */
export function cloneGemTrace(source: THREE.Material, clone: THREE.MeshPhysicalMaterial): void {
  const params = source.userData[GEM_TRACE_KEY] as GemTraceParams | undefined;
  const sourceUniforms = uniformsByMaterial.get(source);
  if (!params || !sourceUniforms) return;
  applyGemTrace(clone, { ...params, bounces: sourceUniforms.bounces.value });
  const uniforms = uniformsByMaterial.get(clone)!;
  uniforms.envTexture.value = sourceUniforms.envTexture.value;
  uniforms.envIntensity.value = sourceUniforms.envIntensity.value;
  uniforms.envRotation.value = sourceUniforms.envRotation.value;
}

/** Point a traced gem at an equirect HDR; `null` restores the procedural light tent. */
export function setGemTraceEnvironment(
  material: THREE.Material,
  environment: THREE.Texture | null,
  rotation = 0,
  intensity = 1,
): void {
  const uniforms = uniformsByMaterial.get(material);
  if (!uniforms) return;
  const next = environment ?? getGemStudioEnvironment();
  if (uniforms.envTexture.value !== next) uniforms.envTexture.value = next;
  uniforms.envRotation.value = rotation;
  uniforms.envIntensity.value = intensity;
}

/** Switch a traced gem between photographic shading and the ASET cut-quality scope. */
export function setGemTraceScope(material: THREE.Material, enabled: boolean): void {
  const uniforms = uniformsByMaterial.get(material);
  if (uniforms) uniforms.scope.value = enabled ? 1 : 0;
}

export function setGemTraceBounces(material: THREE.Material, bounces: number): void {
  const uniforms = uniformsByMaterial.get(material);
  if (uniforms) uniforms.bounces.value = bounces;
}

/**
 * Run `render` with every traced stone under `root` at no fewer than `bounces` bounces, then
 * restore. Exports share materials with the live view, so a performance-tier viewport would
 * otherwise hand its reduced trace to a final still.
 */
export function withGemTraceBounces<T>(root: THREE.Object3D, bounces: number, render: () => T): T {
  const previous = new Map<GemTraceUniforms, number>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const uniforms = uniformsByMaterial.get(material);
      if (!uniforms || previous.has(uniforms)) continue;
      previous.set(uniforms, uniforms.bounces.value);
      uniforms.bounces.value = Math.max(uniforms.bounces.value, bounces);
    }
  });
  try {
    return render();
  } finally {
    for (const [uniforms, value] of previous) uniforms.bounces.value = value;
  }
}

/** Last-resort path after a shader compile failure: plain transmissive glass, no tracing. */
export function disableGemTrace(material: THREE.MeshPhysicalMaterial): void {
  if (!uniformsByMaterial.delete(material)) return;
  (material as NodeSlots).outputNode = null;
  material.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;
  delete material.userData[GEM_TRACE_KEY];
  material.transmission = 1;
  material.transparent = true;
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
}
