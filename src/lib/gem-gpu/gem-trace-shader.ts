import * as THREE from "three";
import {
  Break,
  Continue,
  Fn,
  If,
  Loop,
  attribute,
  cameraPosition,
  clamp,
  cos,
  dot,
  equirectUV,
  exp,
  float,
  int,
  ivec2,
  max,
  mix,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  normalLocal,
  normalize,
  positionLocal,
  positionWorld,
  smoothstep,
  reflect,
  refract,
  sin,
  sqrt,
  texture,
  uniform,
  uniformArray,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { GEM_STONE_ROW_ATTRIBUTE, gemAtlasTextureNode } from "./gem-trace-atlas";
import { getGemStudioEnvironment } from "./gem-studio-environment";

/**
 * Ray-traced gem shading in TSL.
 *
 * Per fragment: exact dielectric Fresnel reflection at the entry facet, refraction into
 * the stone, then a fixed number of internal bounces against the stone's own facet planes
 * (see `gem-trace-geometry.ts`). At every internal hit the three wavelength bands leave
 * along their own refracted directions — the spread between them is fire — and whatever
 * is totally internally reflected keeps bouncing. Body colour is Beer–Lambert absorption
 * over the actual path length, so a deep pavilion reads darker than a shallow girdle,
 * exactly like a real stone.
 */

type GlintLight = { direction: [number, number, number]; intensity: number };

/**
 * Pinpoint key lights, fixed in the world. An HDR is sampled per texel, so its sources are
 * never smaller than ~0.35°; these analytic lobes are sharper than any texel and survive a
 * user picking an HDRI with no small sources at all — without them, fire has nothing to split.
 */
const DEFAULT_GLINTS: GlintLight[] = [
  { direction: [-0.45, 0.8, 0.4], intensity: 26 },
  { direction: [0.55, 0.72, 0.42], intensity: 26 },
  { direction: [0.08, 0.96, -0.28], intensity: 18 },
  { direction: [-0.25, 0.55, -0.8], intensity: 14 },
];

export const MAX_GEM_GLINTS = DEFAULT_GLINTS.length;

function glintVector({ direction, intensity }: GlintLight): THREE.Vector4 {
  const d = new THREE.Vector3(...direction).normalize();
  return new THREE.Vector4(d.x, d.y, d.z, intensity);
}

/** Shared by every traced gem so a studio light rig can retune all stones at once. */
export const gemGlintLights = uniformArray(DEFAULT_GLINTS.map(glintVector), "vec4");

export type GemTraceParams = {
  /** Refractive index for red, green and blue; their spread is the stone's fire. */
  ior: [number, number, number];
  /** Beer–Lambert absorption per stone radius travelled, per channel. */
  absorption: [number, number, number];
  /** Internal bounces traced. Brilliance comes mostly from the first four. */
  bounces: number;
};

export function createGemTraceUniforms(params: GemTraceParams) {
  return {
    ior: uniform(new THREE.Vector3(...params.ior)),
    absorption: uniform(new THREE.Vector3(...params.absorption)),
    /** Read as `int()` in the shader; a float uniform keeps the TSL typings simple. */
    bounces: uniform(params.bounces),
    envIntensity: uniform(1),
    envRotation: uniform(0),
    glintStrength: uniform(1),
    glintSharpness: uniform(5200),
    /** How much the camera and photographer block light arriving from the viewer's side. */
    viewerObstruction: uniform(0.97),
    /** 1 renders the ASET cut-quality scope instead of the environment. */
    scope: uniform(0),
    /** Base node; samples are taken from clones so swapping `.value` retargets them all. */
    envTexture: texture(getGemStudioEnvironment()),
  };
}

export type GemTraceUniforms = ReturnType<typeof createGemTraceUniforms>;

type ScalarNode = Node<"float">;
type VectorNode = Node<"vec3">;

/** Unpolarised dielectric Fresnel reflectance; `eta` = n(incident side) / n(transmitted side). */
const fresnelDielectric = Fn(([cosI, eta]: [ScalarNode, ScalarNode]) => {
  const sin2T = eta.mul(eta).mul(float(1).sub(cosI.mul(cosI)));
  const reflectance = float(1).toVar();
  If(sin2T.lessThan(1), () => {
    const cosT = sqrt(float(1).sub(sin2T));
    const rs = eta.mul(cosI).sub(cosT).div(eta.mul(cosI).add(cosT));
    const rp = cosI.sub(eta.mul(cosT)).div(cosI.add(eta.mul(cosT)));
    reflectance.assign(rs.mul(rs).add(rp.mul(rp)).mul(0.5));
  });
  return reflectance;
});

function createEnvironmentSampler(u: GemTraceUniforms) {
  const glints = (dirWorld: VectorNode) => {
    const sum = float(0).toVar();
    Loop(MAX_GEM_GLINTS, ({ i }) => {
      const light = gemGlintLights.element(i) as unknown as Node<"vec4">;
      sum.addAssign(exp(dot(dirWorld, light.xyz).sub(1).mul(u.glintSharpness)).mul(light.w));
    });
    return sum.mul(u.glintStrength);
  };

  /**
   * A real stone is always photographed with a camera in front of it, and light that would
   * leave the stone toward the lens cannot have come *from* there — the camera and the person
   * behind it block it. That cone (fully dark within ~16°, gone by ~23°: the head-and-lens
   * obstruction the ASET scope marks blue, plus a photographer's black card) paints the black
   * arrows between bright facets; a static environment has no such hole, so it is cut here,
   * relative to the camera. Much wider and a well-cut stone reads black instead of bright.
   */
  const toViewer = normalize(cameraPosition.sub(positionWorld));
  const viewerShadow = (dirWorld: VectorNode) =>
    float(1).sub(smoothstep(0.95, 0.975, dot(dirWorld, toViewer)).mul(u.viewerObstruction));

  /**
   * ASET (Angular Spectrum Evaluation Tool) colours light by the angle it arrives from,
   * measured from the viewer: within 15° is the observer's own head and lens (blue,
   * obstruction), 15–45° is the bright light from 45–75° above the girdle plane (red),
   * 45–90° is low-angle light (green), and anything from behind the stone is leakage
   * (white). A traced stone shows exactly where a real one would.
   */
  const asetColor = (dirWorld: VectorNode) => {
    const fromViewer = dot(dirWorld, toViewer);
    // Kept below the tone mapper's shoulder so the scope colours stay saturated, as on a lab print.
    const leakage = vec3(0.7, 0.7, 0.7);
    const lowLight = mix(leakage, vec3(0.02, 0.42, 0.06), smoothstep(-0.02, 0.02, fromViewer));
    const brightLight = mix(lowLight, vec3(0.55, 0.02, 0.02), smoothstep(0.69, 0.725, fromViewer));
    return mix(brightLight, vec3(0.03, 0.08, 0.6), smoothstep(0.958, 0.972, fromViewer));
  };

  /** Radiance arriving along a geometry-space direction. Rotation matches metals' envMapRotation. */
  return (dirLocal: VectorNode) => {
    const w = normalize(modelWorldMatrix.mul(vec4(dirLocal, 0)).xyz);
    const c = cos(u.envRotation);
    const s = sin(u.envRotation);
    const rotated = vec3(w.x.mul(c).sub(w.z.mul(s)), w.y, w.x.mul(s).add(w.z.mul(c)));
    const env = texture(u.envTexture, equirectUV(rotated), 0).rgb.mul(u.envIntensity);
    const lit = env.add(vec3(glints(w))).mul(viewerShadow(w));
    return mix(lit, asetColor(w), u.scope);
  };
}

/**
 * Output node for a traced gem. Geometry must be registered with
 * `registerGemTraceGeometry`; unregistered meshes read atlas row 0, an empty stone, and
 * degrade to reflection plus a single refraction instead of reading another stone's planes.
 */
export function createGemTraceOutputNode(u: GemTraceUniforms) {
  const sampleEnvironment = createEnvironmentSampler(u);

  return Fn(() => {
    const row = int(attribute<"float">(GEM_STONE_ROW_ATTRIBUTE, "float").add(0.5)).toVar();
    const header = gemAtlasTextureNode.load(ivec2(int(0), row)).toVar();
    const planeCount = int(header.x).toVar();
    const radius = max(header.y, float(1e-6)).toVar();
    // A stone traced as two convex pieces (a heart): the partner piece's row and the split
    // plane between them. -1 / 0 for every ordinary stone.
    const partnerRow = int(header.z).toVar();
    const splitPlane = int(header.w).toVar();

    const cameraLocal = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
    const pos = positionLocal.toVar();
    const viewDir = normalize(pos.sub(cameraLocal)).toVar();
    const normal = normalize(normalLocal).toVar();
    If(dot(viewDir, normal).greaterThan(0), () => {
      normal.assign(normal.negate());
    });

    const cosEntry = clamp(dot(viewDir, normal).negate(), 0, 1);
    const entryEta = float(1).div(u.ior.y);
    const entryReflectance = fresnelDielectric(cosEntry, entryEta);
    const color = sampleEnvironment(reflect(viewDir, normal)).mul(entryReflectance).toVar();

    const dir = refract(viewDir, normal, entryEta).toVar();
    const throughput = (vec3(1, 1, 1).mul(float(1).sub(entryReflectance)) as VectorNode).toVar();

    Loop({ start: int(0), end: int(u.bounces), type: "int", condition: "<" }, () => {
      const tExit = float(1e9).toVar();
      const exitNormal = vec3(0, 1, 0).toVar();
      const exitPlane = int(0).toVar();
      Loop({ start: int(1), end: planeCount.add(1), type: "int", condition: "<" }, ({ i }) => {
        const plane = gemAtlasTextureNode.load(ivec2(i, row));
        const facing = dot(plane.xyz, dir);
        If(facing.greaterThan(1e-6), () => {
          const t = plane.w.sub(dot(plane.xyz, pos)).div(facing);
          If(t.greaterThan(radius.mul(1e-4)).and(t.lessThan(tExit)), () => {
            tExit.assign(t);
            exitNormal.assign(plane.xyz);
            exitPlane.assign(i);
          });
        });
      });
      // An open hull (or an empty stone) has no exit ahead; the escape term below covers it.
      If(tExit.greaterThan(1e8), () => {
        Break();
      });

      pos.addAssign(dir.mul(tExit));
      // exp() is component-wise at runtime; its typings only admit scalars.
      const opticalDepth = u.absorption.mul(tExit.div(radius)).negate() as unknown as ScalarNode;
      throughput.assign((exp(opticalDepth) as unknown as VectorNode).mul(throughput));

      // The split plane is inside the stone: no surface there, so the ray carries straight
      // on into the partner piece (and this pass still counts as a bounce).
      If(exitPlane.equal(splitPlane).and(partnerRow.greaterThanEqual(0)), () => {
        row.assign(partnerRow);
        header.assign(gemAtlasTextureNode.load(ivec2(int(0), row)));
        planeCount.assign(int(header.x));
        partnerRow.assign(int(header.z));
        splitPlane.assign(int(header.w));
        Continue();
      });

      const cosExit = clamp(dot(dir, exitNormal), 0, 1);
      const inward = exitNormal.negate();
      const fR = fresnelDielectric(cosExit, u.ior.x);
      const fG = fresnelDielectric(cosExit, u.ior.y);
      const fB = fresnelDielectric(cosExit, u.ior.z);

      // Each band leaves along its own refracted ray; refract() is undefined under TIR, so
      // only sample bands that actually escape.
      const escapedR = float(0).toVar();
      const escapedG = float(0).toVar();
      const escapedB = float(0).toVar();
      If(fR.lessThan(1), () => {
        escapedR.assign(sampleEnvironment(refract(dir, inward, u.ior.x)).x.mul(float(1).sub(fR)));
      });
      If(fG.lessThan(1), () => {
        escapedG.assign(sampleEnvironment(refract(dir, inward, u.ior.y)).y.mul(float(1).sub(fG)));
      });
      If(fB.lessThan(1), () => {
        escapedB.assign(sampleEnvironment(refract(dir, inward, u.ior.z)).z.mul(float(1).sub(fB)));
      });
      color.addAssign(throughput.mul(vec3(escapedR, escapedG, escapedB)));

      throughput.assign(throughput.mul(vec3(fR, fG, fB)));
      dir.assign(reflect(dir, exitNormal));
    });

    // Light still trapped after the last traced bounce leaves eventually; approximating
    // its exit with the current direction keeps low bounce counts from reading dark.
    color.addAssign(throughput.mul(sampleEnvironment(dir)));
    return vec4(color, 1);
  })();
}
