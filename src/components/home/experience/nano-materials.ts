import * as THREE from "three";
import {
  abs,
  attribute,
  clamp,
  color,
  cos,
  cross,
  Discard,
  dot,
  exp,
  float,
  Fn,
  fract,
  If,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  modelViewMatrix,
  positionLocal,
  positionView,
  pow,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  uniformArray,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { LineBasicNodeMaterial, MeshBasicNodeMaterial, PointsNodeMaterial, type Node } from "three/webgpu";
import { LANDING_FLIGHT, LANDING_SPREAD } from "./chapters";

/**
 * Shaders for the home film's assembly. One set of uniforms drives the whole build — swarm,
 * strings, wireframe, metal tiles and the stone's spark — so the film only writes numbers.
 *
 * The hologram (points, strings, wires, grid) has two looks: light added over a
 * dark stage, or blueprint ink painted over paper in the light theme (`light` = 1, with
 * normal blending — see `themeHologram`).
 */

type FloatNode = Node<"float">;
type Vec3Node = Node<"vec3">;

/** The cool light of the hologram: wires, points, and the flash of a landing tile. */
const HOLO = vec3(0.5, 0.82, 1);
const WHITE_HOT = vec3(1, 0.96, 0.88);
/** The afterglow of a landed tile as it cools, like fresh-cast metal. */
const EMBER = vec3(1, 0.6, 0.26);
/**
 * The light theme's ink: blueprint blue, amber where the build is hot. Paper has no glow
 * to give the galaxy depth, so the ink does it: near-black where it is nearer than the
 * centre, paling toward the paper where it is farther.
 */
const INK = color(0x163a6e);
const INK_DEEP = color(0x07152b);
const INK_FAR = color(0x8a9dbb);
const INK_HOT = color(0xa4600a);
/** Distance in front of (or behind) the galaxy's centre at which the ink is fully deep (or pale), mm. */
const DEPTH_REACH = 55;
/** Climb units a tile takes to land. */
const TILE_DURATION = 0.035;
/** How far above the surface a tile starts its landing, mm. */
const TILE_LIFT = 1.6;
/** Reach of the cursor's stir and pull, mm. */
const STIR_RADIUS = 26;
const PULL_RADIUS = 42;
/**
 * Ripples alive at once, and how they travel: speed (mm/s), life (s), crest spacing
 * (rad/mm). Long, slow crests — about one a second passing any point — read as a swell
 * through the disc rather than a shiver.
 */
export const PULSES = 6;
const PULSE_SPEED = 42;
const PULSE_LIFE = 2.8;
const PULSE_WAVENUMBER = 0.2;

export function createNanoUniforms() {
  return {
    /** 1 in the light theme. */
    light: uniform(0),
    /** 0 = free swarm, 1 = every point on the surface. */
    gather: uniform(0),
    pointsAlpha: uniform(1),
    pointSize: uniform(0.05),
    /** The cursor in ring space (mm), how hard it stirs the free swarm, and how hard a held
     * button pulls it into a vortex. */
    pointer: uniform(new THREE.Vector3(0, 0, 999)),
    push: uniform(0),
    attract: uniform(0),
    /**
     * Ripples from recent releases and taps (ring space xyz, start time w on the `now`
     * clock), reused round-robin: each new tap adds its own ripple while the earlier ones
     * keep spreading, so tapping on makes a wave train.
     */
    pulses: uniformArray(Array.from({ length: PULSES }, () => new THREE.Vector4(0, 0, 999, -99)), "vec4"),
    now: uniform(0),
    /** Extra turn of the free disc, radians (fast scrolls spin it). */
    spin: uniform(0),
    /** Wireframe draw-in scan, 0..1, and its overall strength. */
    wire: uniform(0),
    wireAlpha: uniform(0),
    /** The metal front: tiles whose landing time is behind it have landed. */
    climb: uniform(-0.1),
    /** A second front that re-colours landed metal from `colorA` to `colorB`. */
    swap: uniform(-0.1),
    swapGlow: uniform(0),
    colorA: uniform(new THREE.Color()),
    colorB: uniform(new THREE.Color()),
    /** The stone is revealed above this height (stone space, mm). */
    sweep: uniform(999),
    sweepGlow: uniform(0),
  };
}

export type NanoUniforms = ReturnType<typeof createNanoUniforms>;
export type FloatUniform = NanoUniforms["gather"];
export type HologramMaterial = LineBasicNodeMaterial | PointsNodeMaterial;

/** Rotates `v` about the unit axis `k` by `angle` (Rodrigues). */
function rotateAbout(v: Vec3Node, k: Vec3Node, angle: FloatNode): Vec3Node {
  const c = cos(angle);
  return v
    .mul(c)
    .add(cross(k, v).mul(sin(angle)))
    .add(k.mul(dot(k, v).mul(float(1).sub(c)))) as Vec3Node;
}

/** Node slots on a classic material all hash alike in the WebGPU renderer; give each its own key. */
function keyShader(material: THREE.Material, key: string) {
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}

function hologramMaterial<T extends HologramMaterial>(material: T): T {
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  // Fully faded fragments are dropped, not drawn clear: a drawn fragment still writes the
  // motion TRAA reads, and the swarm's empty sprite squares would smear the metal under them.
  material.alphaTest = 0.01;
  return material;
}

/**
 * Colours a hologram material: `glow` is its light over the dark stage; on paper the same
 * strength becomes ink density, `heat` turns the ink amber and `depth` (0 far … 1 near,
 * see `galaxyDepth`) deepens or pales it.
 */
function paint(material: HologramMaterial, u: NanoUniforms, glow: Vec3Node, alpha: FloatNode, heat: FloatNode = float(0), depth: FloatNode = float(0.5)) {
  const strength = max(glow.x, max(glow.y, glow.z));
  const ink = mix(mix(INK_FAR, INK, smoothstep(0, 0.5, depth)), INK_DEEP, smoothstep(0.5, 1, depth));
  material.colorNode = mix(glow, mix(ink, INK_HOT, heat), u.light);
  const density = clamp(strength.mul(0.25).add(0.4), 0, 0.95).mul(mix(float(0.45), float(1.35), depth));
  material.opacityNode = alpha.mul(mix(float(1), min(density, 1), u.light));
}

/** How near the camera a fragment is against the galaxy's centre: 0 far, ½ level, 1 near. */
function galaxyDepth(discY: number): FloatNode {
  const centre = modelViewMatrix.mul(vec4(0, discY, 0, 1));
  const reach = length(modelViewMatrix.mul(vec4(DEPTH_REACH, 0, 0, 0)).xyz);
  return clamp(positionView.z.sub(centre.z).div(reach).mul(0.5).add(0.5), 0, 1);
}

/**
 * On paper the galaxy's glow becomes a wash of ink under its core and disc — the depth a
 * dark stage gets from bloom. Light theme only; it lifts off as the swarm leaves the disc.
 */
export function createInkWash(discY: number, u: NanoUniforms): THREE.Mesh {
  const size = 200;
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const r = length(uv().sub(0.5)).mul(size);
  const core = exp(r.div(19).pow(2).negate());
  const disc = exp(r.div(56).pow(2).negate());
  material.colorNode = INK_DEEP;
  material.opacityNode = core.mul(0.38).add(disc.mul(0.1)).mul(u.light).mul(float(1).sub(smoothstep(0.02, 0.42, u.gather)));
  // Its faint rim is dropped, not drawn clear (see `hologramMaterial`).
  material.alphaTest = 0.004;
  keyShader(material, "home-ink-wash");
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(0, discY - 0.6, 0), material);
  // Under the swarm and strings, which paint their ink over it.
  wash.renderOrder = -1;
  return wash;
}

/** Light over the dark stage (added), or ink over paper (painted). */
export function themeHologram(materials: readonly HologramMaterial[], light: boolean): void {
  for (const material of materials) {
    material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    material.needsUpdate = true;
  }
}

/** Where a free point of the galaxy is now: the disc turns almost rigidly, so its arms keep their shape. */
function orbiting(orbit: Vec3Node, discY: number, u: NanoUniforms): Vec3Node {
  const angle = orbit.y.add(time.mul(float(0.09).add(float(1.1).div(orbit.x.add(8))))).add(u.spin);
  return vec3(cos(angle).mul(orbit.x), orbit.z.add(discY), sin(angle).mul(orbit.x));
}

/**
 * How the cursor moves a free point at `p`: moving stirs it aside in a whirl, a held button
 * pulls it into a vortex, and every release or tap sends a ripple out — a short train of
 * crests that lifts the disc as it passes, adding up with the ripples before it. `energy`
 * is how much all of that lights the point up.
 */
function cursorField(p: Vec3Node, u: NanoUniforms): { offset: Vec3Node; energy: FloatNode } {
  const away = p.sub(u.pointer);
  const distance = max(length(away), 0.001);
  const outward = away.div(distance);
  const around = vec3(outward.z.negate(), 0, outward.x);
  const stir = pow(float(1).sub(smoothstep(0, STIR_RADIUS, distance)), 2);
  const pull = pow(float(1).sub(smoothstep(0, PULL_RADIUS, distance)), 1.5).mul(u.attract);
  let offset = outward
    .mul(stir.mul(u.push))
    .add(around.mul(stir.mul(u.push).mul(0.9)))
    .add(outward.mul(distance.mul(pull).mul(-0.6)))
    .add(around.mul(pull.mul(6))) as Vec3Node;
  let energy = float(1).add(stir.mul(u.push).mul(0.25)).add(pull.mul(2)) as FloatNode;
  for (let k = 0; k < PULSES; k++) {
    const pulse = u.pulses.element(k) as unknown as Node<"vec4">;
    const age = u.now.sub(pulse.w);
    const from = p.sub(pulse.xyz);
    const reach = max(length(from), 0.001);
    const front = reach.sub(age.mul(PULSE_SPEED));
    const envelope = exp(front.mul(front).div(-800)).mul(clamp(float(1).sub(age.div(PULSE_LIFE)), 0, 1));
    const ripple = cos(front.mul(PULSE_WAVENUMBER)).mul(envelope);
    offset = offset.add(from.div(reach).mul(ripple.mul(3))).add(vec3(0, ripple.mul(3.5), 0)) as Vec3Node;
    energy = energy.add(abs(ripple).mul(1.3)) as FloatNode;
  }
  return { offset, energy };
}

/**
 * Metal that assembles itself. Each tile (see `tileGeometry`) drops onto the surface from
 * above, spinning and growing from its centre, flashes the hologram's light along its seams
 * as it locks in, and cools to the metal. A second front re-colours the finished piece.
 * Stays a `MeshPhysicalMaterial`, so the studio environment lights it like any other metal.
 */
export function applyNanoTiles(material: THREE.MeshPhysicalMaterial, u: NanoUniforms, key: string): void {
  const centroid = attribute<"vec3">("aCentroid", "vec3");
  const faceNormal = attribute<"vec3">("aFaceNormal", "vec3");
  const bary = attribute<"vec3">("aBary", "vec3");
  const tile = attribute<"vec2">("aTile", "vec2");
  const landing = tile.x as FloatNode;
  const seed = tile.y as FloatNode;

  const age = u.climb.sub(landing).div(TILE_DURATION);
  const t = clamp(age, 0, 1);
  const settled = t.mul(t).mul(float(3).sub(t.mul(2)));
  const airborne = float(1).sub(settled);
  const offset = positionLocal.sub(centroid).mul(settled) as Vec3Node;
  const spun = rotateAbout(offset, faceNormal, airborne.mul(seed.sub(0.5).mul(7)));
  const lift = faceNormal.mul(airborne.mul(TILE_LIFT).mul(seed.add(0.35)));
  Object.assign(material, { positionNode: centroid.add(spun).add(lift) });

  // A tile flashes the hologram's light as it lands, then cools through an ember glow to
  // the metal over a few tile-lengths; its seams burn brightest and longest.
  const fresh = step(0, age).mul(exp(max(age, 0).mul(-1.1)));
  const seam = float(1).sub(smoothstep(0, 0.1, min(bary.x, min(bary.y, bary.z))));
  const swapped = smoothstep(landing.sub(0.012), landing.add(0.012), u.swap);
  const swapFront = float(1).sub(smoothstep(0, 0.03, abs(u.swap.sub(landing))));
  Object.assign(material, {
    colorNode: mix(u.colorA, u.colorB, swapped),
    emissiveNode: HOLO.mul(fresh.mul(fresh).mul(7))
      .add(EMBER.mul(fresh.mul(float(1).sub(fresh)).mul(5)))
      .mul(seam.mul(0.8).add(0.2))
      .add(WHITE_HOT.mul(swapFront.mul(seam.mul(0.7).add(0.3)).mul(u.swapGlow))),
  });
  keyShader(material, `nano-tiles-${key}`);
}

/**
 * The CAD wireframe: drawn in by the scan, brightest right at the scan line, and gone
 * wherever the metal has landed.
 */
export function createWireMaterial(u: NanoUniforms): LineBasicNodeMaterial {
  const material = hologramMaterial(new LineBasicNodeMaterial());
  const climb = attribute<"float">("aClimb", "float");
  const scan = attribute<"float">("aScan", "float");
  const drawn = smoothstep(scan.sub(0.05), scan, u.wire);
  const scanLine = float(1).sub(smoothstep(0, 0.035, abs(u.wire.sub(scan))));
  const bare = float(1).sub(smoothstep(climb.sub(0.004), climb.add(0.03), u.climb));
  paint(material, u, HOLO.mul(float(0.8).add(scanLine.mul(7))), drawn.mul(bare).mul(u.wireAlpha).mul(0.55), scanLine);
  return material;
}

/** The stone's facet outlines: they burn brightest at the sweep and vanish behind it. */
export function createFacetMaterial(u: NanoUniforms): LineBasicNodeMaterial {
  const material = hologramMaterial(new LineBasicNodeMaterial());
  const scan = attribute<"float">("aScan", "float");
  const y = positionLocal.y;
  const drawn = smoothstep(scan.sub(0.05), scan, u.wire);
  const revealed = smoothstep(u.sweep.sub(0.08), u.sweep.add(0.08), y);
  const atSweep = float(1).sub(smoothstep(0, 0.35, abs(y.sub(u.sweep)))).mul(min(u.sweepGlow, 1));
  paint(material, u, HOLO.mul(float(1.2).add(atSweep.mul(8))), drawn.mul(float(1).sub(revealed)).mul(u.wireAlpha).mul(0.9), atSweep);
  return material;
}

/** A CAD workspace floor's lines, fading out with distance from the piece. */
export function createGridMaterial(u: NanoUniforms, strength: FloatUniform, extent: number): LineBasicNodeMaterial {
  const material = hologramMaterial(new LineBasicNodeMaterial());
  const fade = float(1).sub(smoothstep(10, extent, length(positionLocal.xz)));
  paint(material, u, vec3(0.45, 0.75, 1), fade.mul(strength).mul(0.22));
  return material;
}

/**
 * Reveals a traced stone from the table down: fragments below the sweep are discarded (the
 * facet outlines show there), and a band of white light rides the sweep line.
 */
export function applyStoneSweep(material: THREE.MeshPhysicalMaterial, u: NanoUniforms): void {
  const traced = (material as unknown as { outputNode: Node<"vec4"> }).outputNode;
  const y = positionLocal.y;
  const output = Fn(() => {
    If(y.lessThan(u.sweep), () => {
      Discard();
    });
    const band = float(1).sub(smoothstep(0, 0.45, y.sub(u.sweep)));
    return vec4(traced.rgb.add(WHITE_HOT.mul(band.mul(band).mul(u.sweepGlow))), 1);
  })();
  Object.assign(material, { outputNode: output });
  keyShader(material, `nano-stone-${output.id}`);
}

export type SwarmData = {
  /** Free orbit of each point: radius, start angle, height (ring space, mm). */
  orbit: Float32Array;
  /** Height of the galaxy's plane (ring space, mm): the ring rises out of it. */
  discY: number;
  /** Where each point lands on the surface. */
  target: Float32Array;
  /** Landing order (0 = the base of the band, 1 = the top of the stone), random, size, climb time. */
  seed: Float32Array;
};

/**
 * The nano swarm: a galaxy of points circling the ring that streams in and lands on its
 * surface from the base up, a bright layer marking the height being built, then winks out
 * where the metal lands. While free it plays with the cursor (see `cursorField`).
 */
export function createSwarm(data: SwarmData, u: NanoUniforms): { swarm: THREE.Sprite; material: PointsNodeMaterial } {
  const count = data.seed.length / 4;
  const orbit = instancedBufferAttribute(new THREE.InstancedBufferAttribute(data.orbit, 3)) as unknown as Vec3Node;
  const target = instancedBufferAttribute(new THREE.InstancedBufferAttribute(data.target, 3)) as unknown as Vec3Node;
  const seed = instancedBufferAttribute(new THREE.InstancedBufferAttribute(data.seed, 4)) as unknown as Node<"vec4">;

  const free = orbiting(orbit, data.discY, u);
  const t = clamp(u.gather.sub(seed.x.mul(LANDING_SPREAD)).div(LANDING_FLIGHT), 0, 1);
  const landed = t.mul(t).mul(float(3).sub(t.mul(2)));
  const loose = float(1).sub(landed);
  const p = mix(free, target, landed);
  // One swirl for every point, unwinding as it lands: the free disc keeps its arms, and each
  // point spirals in on its own schedule.
  const swirl = loose.mul(2.4);
  const spun = vec3(p.x.mul(cos(swirl)).sub(p.z.mul(sin(swirl))), p.y, p.x.mul(sin(swirl)).add(p.z.mul(cos(swirl))));
  const cursor = cursorField(spun, u);

  const material = hologramMaterial(new PointsNodeMaterial({ sizeAttenuation: true }));
  material.positionNode = spun.add(cursor.offset.mul(loose));

  // The layer being built right now burns bright, like a printer's hot line; the galaxy
  // still waiting its turn dims, so the printing ring reads over it.
  const building = u.gather.sub(LANDING_FLIGHT).div(LANDING_SPREAD);
  const layer = float(1).sub(smoothstep(0, 0.012, abs(seed.x.sub(building)))).mul(float(1).sub(smoothstep(0.97, 1, building)));
  const waiting = float(1).sub(u.gather.mul(0.62));
  const energy = mix(float(1), cursor.energy.mul(waiting), loose).add(layer.mul(1.6));
  const twinkle = sin(time.mul(2.6).add(seed.y.mul(40))).mul(0.35).add(0.65);
  const underMetal = smoothstep(seed.w.sub(0.01), seed.w.add(0.03), u.climb);
  const disc = float(1).sub(smoothstep(0.18, 0.5, length(uv().sub(0.5))));
  // A few points burn warm, like embers in the swarm.
  const tint = mix(HOLO, WHITE_HOT, max(pow(seed.y, 10), layer.mul(0.6)));
  const glow = tint.mul(twinkle.mul(float(1.3).add(loose.mul(1.6))).mul(energy)) as Vec3Node;
  // On paper the bulge prints darkest, as in a negative of a galaxy: the free core takes the deepest ink.
  const bulge = exp(orbit.x.div(15).pow(2).negate()).mul(loose);
  const depth = max(galaxyDepth(data.discY), bulge.mul(0.5).add(0.5));
  paint(material, u, glow, u.pointsAlpha.mul(float(1).sub(underMetal)).mul(disc), layer, depth);
  // Ink dots on paper need a little more body than points of light.
  material.sizeNode = seed.z.mul(u.pointSize).mul(float(1).add(layer.mul(0.3))).mul(u.light.mul(0.45).add(1));

  const swarm = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  swarm.count = count;
  swarm.frustumCulled = false;
  return { swarm, material };
}

/**
 * The galaxy's halo and the sky beyond it: faint stars of a fixed few pixels (so one
 * passing near the camera never swells into a blot), turning slowly with the disc and
 * fading as the swarm leaves it for the ring.
 */
export function createHalo(data: { orbit: Float32Array; seed: Float32Array }, discY: number, u: NanoUniforms): { halo: THREE.Sprite; material: PointsNodeMaterial } {
  const orbit = instancedBufferAttribute(new THREE.InstancedBufferAttribute(data.orbit, 3)) as unknown as Vec3Node;
  const seed = instancedBufferAttribute(new THREE.InstancedBufferAttribute(data.seed, 2)) as unknown as Node<"vec2">;
  const angle = orbit.y.add(time.mul(0.012)).add(u.spin.mul(0.25));
  const material = hologramMaterial(new PointsNodeMaterial({ sizeAttenuation: false }));
  material.positionNode = vec3(cos(angle).mul(orbit.x), orbit.z.add(discY), sin(angle).mul(orbit.x));
  const twinkle = sin(time.mul(1.7).add(seed.y.mul(50))).mul(0.3).add(0.7);
  const round = float(1).sub(smoothstep(0.2, 0.5, length(uv().sub(0.5))));
  const glow = HOLO.mul(seed.x.mul(0.9).add(0.3).mul(twinkle)) as Vec3Node;
  // Most of the sky is far behind the disc; on paper it would pale away entirely, so it keeps some ink.
  paint(material, u, glow, round.mul(float(1).sub(smoothstep(0.02, 0.42, u.gather))), float(0), max(galaxyDepth(discY), 0.4));
  material.sizeNode = seed.x.mul(2.2).add(1.6).mul(u.light.mul(0.25).add(1));
  const halo = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  halo.count = data.seed.length / 2;
  halo.frustumCulled = false;
  return { halo, material };
}

/**
 * The galaxy's strings: long threads laid along its arms, turning with the disc, with a
 * packet of light running down each one. They bend with the cursor like the points do and
 * dissolve as the swarm leaves the disc for the ring.
 */
export function createStringMaterial(discY: number, u: NanoUniforms): LineBasicNodeMaterial {
  const material = hologramMaterial(new LineBasicNodeMaterial());
  const orbit = attribute<"vec3">("aOrbit", "vec3");
  const along = attribute<"vec2">("aAlong", "vec2");
  const free = orbiting(orbit, discY, u);
  const cursor = cursorField(free, u);
  material.positionNode = free.add(cursor.offset);
  const phase = fract(along.x.sub(time.mul(0.11)).add(along.y)).sub(0.5);
  const packet = exp(phase.mul(phase).div(-0.004));
  const ends = pow(sin(along.x.mul(Math.PI)), 0.7);
  const glow = HOLO.mul(float(0.45).add(packet.mul(2.4)).mul(cursor.energy)) as Vec3Node;
  // One-pixel threads need more ink on paper than light on a dark stage to read as arms.
  const fade = ends.mul(float(1).sub(smoothstep(0.02, 0.42, u.gather))).mul(0.42).mul(mix(float(1), float(1.9), u.light));
  paint(material, u, glow, fade, packet.mul(0.6), galaxyDepth(discY));
  return material;
}
