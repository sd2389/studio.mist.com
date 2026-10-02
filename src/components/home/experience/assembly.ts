import * as THREE from "three";
import { uniform } from "three/tsl";
import { clamp01, filmMoment, smoothstep as ease, story } from "@/components/scroll-film/story";
import { JEWELRY_MODEL_ROOT_KEY } from "@/features/scene-setups";
import { prepareGemTraceMesh } from "@/lib/gem-gpu/gem-trace-material";
import { gemGlintLights } from "@/lib/gem-gpu/gem-trace-shader";
import { buildJewelry, getPreset, partToMesh } from "@/lib/jewelry-cad";
import { createPresetMaterial } from "@/lib/material-presets";
import {
  BAND_END,
  climbAt,
  FACTS,
  gatherAt,
  hologramAt,
  hoverAt,
  I,
  reformAt,
  REFORM_METALS,
  RING_DESIGN,
  SWARM_POINTS,
  sweepAt,
  wireAt,
} from "./chapters";
import { STAR_KIND, armAngle, pickArm } from "./galaxy-shape";
import { facetGeometry, galaxyStrings, seededRandom, surfaceSamples, tileGeometry, wireGeometry, type Climb, type SurfacePart } from "./nano-geometry";
import {
  applyNanoTiles,
  applyStoneSweep,
  createFacetMaterial,
  createGridMaterial,
  createHalo,
  createInkWash,
  createNanoUniforms,
  createStringMaterial,
  createSwarm,
  createWireMaterial,
  PULSES,
  themeHologram,
  type HologramMaterial,
} from "./nano-materials";

/**
 * The home film's 3D side, outside React: the CAD solitaire as a galaxy, a wireframe,
 * self-assembling metal and a stone revealed by its own light. `update` runs once a frame
 * on the film clock and only writes uniforms, the camera and the turntable.
 */

/** Scene units per millimetre: the ring is about 2.4 units across. */
const MM = 0.12;
/** How far the stone lifts clear of its claws to take its spark, mm. */
const STONE_LIFT = 7;
/** The galaxy's arms and the strings laid along them. */
const GALAXY_STRINGS = 900;
const STRING_SEGMENTS = 40;
/** Faint stars of the halo and the sky behind it. */
const HALO_STARS = 6000;
const GRID_EXTENT = 64;

/**
 * Camera keys on the film clock (chapter index + progress), in orbit coordinates. `shift`
 * trucks the camera sideways (scene units, + puts the subject right of centre) so the
 * subject clears the chapter's copy on wide screens.
 */
type CameraKey = { t: number; angle: number; radius: number; height: number; look: number; shift: number };
const KEYS: readonly CameraKey[] = [
  { t: 0, angle: 0, radius: 18, height: 9.5, look: -0.9, shift: 0 },
  { t: 1, angle: 0.18, radius: 12, height: 3.4, look: 0, shift: 0.4 },
  // The ring prints from the base up; the camera follows the layer being built.
  { t: 1.35, angle: 0.32, radius: 9.8, height: 1.2, look: -0.4, shift: 1.4 },
  { t: 1.7, angle: 0.48, radius: 9.2, height: 1.7, look: 0.3, shift: 1.5 },
  { t: 2, angle: 0.62, radius: 9, height: 1.6, look: 0.35, shift: 0 },
  { t: 2.5, angle: 0.92, radius: 8.6, height: 1.7, look: 0.3, shift: -1.3 },
  // Low at the shank: the metal starts at the bottom of the band.
  { t: 3, angle: 1.1, radius: 6.6, height: -0.9, look: -0.3, shift: 0 },
  { t: 3.5, angle: 0.85, radius: 7.8, height: 0.4, look: 0.2, shift: 0.3 },
  { t: 4, angle: 0.55, radius: 8, height: 1.6, look: 0.4, shift: 0.3 },
  { t: 4.5, angle: 0.36, radius: 5, height: 2.4, look: 1.25, shift: 0.7 },
  { t: 5, angle: 0.58, radius: 4.2, height: 2.2, look: 1.5, shift: 0 },
  // Level with the lifted stone's girdle: the spark runs down the pavilion to the culet.
  { t: 5.45, angle: 0.8, radius: 3.6, height: 2.42, look: 2.3, shift: -0.5 },
  { t: 5.8, angle: 0.9, radius: 3.9, height: 2.35, look: 2.2, shift: -0.45 },
  { t: 6, angle: 1, radius: 4.4, height: 2, look: 1.5, shift: -0.2 },
  { t: 6.5, angle: 0.4, radius: 9.2, height: 2.1, look: 0.55, shift: 1.2 },
  { t: 7, angle: 0.3, radius: 9.4, height: 2.3, look: 0.55, shift: 1.2 },
  // The end: the ring high in the frame, clear of the call to action along the bottom.
  { t: 8, angle: 0, radius: 10.5, height: 2.6, look: 0, shift: 0 },
];
export const ASSEMBLY_CAMERA: [number, number, number] = [0, KEYS[0]!.height, KEYS[0]!.radius];

const catmullRom = (a: number, b: number, c: number, d: number, s: number) =>
  0.5 * (2 * b + (c - a) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (3 * b - a - 3 * c + d) * s * s * s);

function cameraKey(t: number): Omit<CameraKey, "t"> {
  let k = 0;
  while (k < KEYS.length - 2 && t > KEYS[k + 1]!.t) k += 1;
  const [a, b, c, d] = [KEYS[Math.max(k - 1, 0)]!, KEYS[k]!, KEYS[k + 1]!, KEYS[Math.min(k + 2, KEYS.length - 1)]!];
  const s = clamp01((t - b.t) / (c.t - b.t));
  const at = (field: keyof Omit<CameraKey, "t">) => catmullRom(a[field], b[field], c[field], d[field], s);
  return { angle: at("angle"), radius: at("radius"), height: at("height"), look: at("look"), shift: at("shift") };
}

/** A fine grid in the floor plane, as line segments. */
function gridGeometry(floorY: number): THREE.BufferGeometry {
  const spacing = 4;
  const points: number[] = [];
  for (let v = -GRID_EXTENT; v <= GRID_EXTENT; v += spacing) {
    points.push(-GRID_EXTENT, floorY, v, GRID_EXTENT, floorY, v, v, floorY, -GRID_EXTENT, v, floorY, GRID_EXTENT);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/** Normal-ish random (sum of three uniforms, σ ≈ 0.5). */
const gauss = (random: () => number) => random() + random() + random() - 1.5;

/**
 * The halo round the disc and the sky beyond it, as orbits (radius, angle, height) and seeds
 * (size, twinkle): stars on rays from the centre, thinning outward and flattened toward the
 * disc, reaching past the frame's corners so the space around the spiral is never empty.
 */
function galaxyHalo(random: () => number): { orbit: Float32Array; seed: Float32Array } {
  const orbit = new Float32Array(HALO_STARS * 3);
  const seed = new Float32Array(HALO_STARS * 2);
  for (let i = 0; i < HALO_STARS; i++) {
    const r = 70 + 430 * random() ** 1.6;
    const lat = random() * 2 - 1;
    orbit.set([r * Math.sqrt(1 - lat * lat), random() * Math.PI * 2, r * lat * 0.7], i * 3);
    seed.set([random() ** 3, random()], i * 2);
  }
  return { orbit, seed };
}

/**
 * The swarm's free orbits (radius, angle, height, kind): a grand-design spiral built like a
 * real one. A round bulge of old stars at the heart; logarithmic arms of young stars, each with
 * a dust lane along its inner edge where few stars show; knots of star formation strung along
 * the arms; and an older disc filling in between, out past the arms so the rim is never bare.
 */
function galaxyOrbits(random: () => number): Float32Array {
  const orbit = new Float32Array(SWARM_POINTS * 4);
  let knot = { r: 30, angle: 0, left: 0 };
  for (let i = 0; i < SWARM_POINTS; i++) {
    const roll = random();
    let radius: number, angle: number, height: number, kind: number;
    if (roll < 0.12) {
      // Bulge: an exponential ball sampled from the very centre, so it is densest at the nucleus.
      radius = Math.min(7 * -Math.log(Math.max(random(), 1e-6)), 30);
      angle = random() * Math.PI * 2;
      height = gauss(random) * (2.5 + 0.55 * (30 - radius));
      kind = STAR_KIND.bulge;
    } else if (roll < 0.3) {
      // The older disc between the arms.
      radius = Math.min(10 - 26 * Math.log(Math.max(random(), 1e-6)), 135);
      angle = random() * Math.PI * 2;
      height = gauss(random) * (1.5 + radius * 0.05);
      kind = STAR_KIND.disc;
    } else if (roll < 0.34) {
      // Star-forming knots: tight clumps a few millimetres across, sitting on an arm.
      if (knot.left <= 0) {
        const arm = pickArm(random);
        const r = 14 + 70 * random();
        knot = { r, angle: armAngle(arm, r), left: 12 + Math.floor(random() * 20) };
      }
      knot.left -= 1;
      radius = Math.max(4, knot.r + gauss(random) * 2.4);
      angle = knot.angle + (gauss(random) * 2.4) / knot.r;
      height = gauss(random) * 1.2;
      kind = STAR_KIND.knot;
    } else {
      // Arms: young stars across the arm's width, thinned to a dust lane on its inner edge.
      const arm = pickArm(random);
      radius = Math.min(-13 * Math.log(Math.max(random() * random(), 1e-6)), 95);
      const width = 2.2 + radius * 0.09;
      let across = gauss(random) * width;
      if (across < -0.35 * width && across > -1.25 * width && random() < 0.85) across = Math.abs(across) * 0.6;
      angle = armAngle(arm, radius) + across / Math.max(radius, 4);
      height = gauss(random) * (1.4 + radius * 0.06);
      kind = STAR_KIND.arm;
    }
    orbit.set([radius, angle, height, kind], i * 4);
  }
  return orbit;
}

/**
 * Each swarm point's seed: landing order, random, size, climb time. Landing order is rank by
 * height, so the ring builds from the base of the band up to the top of the stone at an
 * even rate of points.
 */
function landingSeeds(samples: { target: Float32Array; climb: Float32Array }, random: () => number): Float32Array {
  const byHeight = Array.from({ length: SWARM_POINTS }, (_, i) => i).sort((a, b) => samples.target[a * 3 + 1]! - samples.target[b * 3 + 1]!);
  const order = new Float32Array(SWARM_POINTS);
  byHeight.forEach((point, rank) => (order[point] = rank / (SWARM_POINTS - 1)));
  const seed = new Float32Array(SWARM_POINTS * 4);
  for (let i = 0; i < SWARM_POINTS; i++) {
    seed.set([clamp01(order[i]! + (random() - 0.5) * 0.02), random(), 0.55 + random() * 0.9, samples.climb[i]!], i * 4);
  }
  return seed;
}

/** Facts for the HUD, measured from the build. */
function recordFacts(built: ReturnType<typeof buildJewelry>, stoneBox: THREE.Box3) {
  const { specs } = built;
  FACTS.triangles = built.parts.reduce((n, part) => n + (part.geometry.index?.count ?? part.geometry.getAttribute("position").count) / 3, 0);
  for (const metal of REFORM_METALS) FACTS.grams[metal.id] = specs.weightsByMetal.find((w) => w.metal === metal.id)?.grams ?? 0;
  FACTS.carat = specs.totalCarat;
  FACTS.stoneMm = stoneBox.max.x - stoneBox.min.x;
  if (!specs.ring) return;
  FACTS.usSize = specs.ring.usSize;
  FACTS.innerDiameterMm = specs.ring.innerDiameterMm;
  FACTS.bandWidthMm = specs.ring.bandWidthMm;
  FACTS.bandThicknessMm = specs.ring.bandThicknessMm;
  FACTS.settingHeightMm = specs.ring.settingHeightMm;
}

export type Assembly = {
  /** Everything the stage renders; the ring itself is the child marked as the model root. */
  group: THREE.Group;
  /** Advance one frame; returns whether the mirror floor should be on. */
  update: (camera: THREE.Camera, time: number, dt: number) => boolean;
  /** The hologram as light over the dark stage, or as ink over paper. */
  setTheme: (light: boolean) => void;
  dispose: () => void;
};

export function createAssembly(): Assembly {
  const built = buildJewelry({ ...getPreset("solitaire").design, ...RING_DESIGN });
  const u = createNanoUniforms();
  const random = seededRandom(7);

  const boxOf = (slot: string) => {
    const part = built.parts.find((p) => p.slot === slot)!;
    part.geometry.computeBoundingBox();
    return part.geometry.boundingBox!.clone();
  };
  const bandBox = boxOf("Metal 1");
  const headBox = boxOf("Heads");
  const stoneBox = boxOf("Gem 1");
  const ringBox = bandBox.clone().union(headBox).union(stoneBox);

  // The metal climbs from the bottom of the band up both sides at once, its front rippling
  // across the band's width, and finishes the band before the head starts: then it runs up
  // the head from the gallery to the claw tips.
  const bandClimb: Climb = (p) => {
    const angle = Math.atan2(p.x, -p.y);
    return (Math.abs(angle) / Math.PI) * (BAND_END - 0.04) + 0.016 * Math.sin(p.z * 3.1 + angle * 9);
  };
  const headClimb: Climb = (p) =>
    BAND_END + (1 - BAND_END) * clamp01((p.y - headBox.min.y) / (headBox.max.y - headBox.min.y)) + 0.01 * Math.sin(p.x * 2.3 + p.z * 1.7);
  const scan: Climb = (p) => (p.x - ringBox.min.x) / (ringBox.max.x - ringBox.min.x);

  const ring = new THREE.Group();
  ring.userData[JEWELRY_MODEL_ROOT_KEY] = true;
  /** Holds the stone (and its facet outlines); it lifts the stone clear for its spark. */
  const seat = new THREE.Group();
  const wireMaterial = createWireMaterial(u);
  const facetMaterial = createFacetMaterial(u);
  const holograms: HologramMaterial[] = [wireMaterial, facetMaterial];
  const surfaces: SurfacePart[] = [];
  /** The wireframe and the stone's facet outlines. */
  const wires: THREE.LineSegments[] = [];
  const disposables: { dispose: () => void }[] = [];

  for (const part of built.parts) {
    if (part.role === "metal") {
      const climb = part.slot === "Heads" ? headClimb : bandClimb;
      const material = createPresetMaterial(RING_DESIGN.metal) as THREE.MeshPhysicalMaterial;
      applyNanoTiles(material, u, part.slot);
      const tiles = partToMesh({ ...part, geometry: tileGeometry(part.geometry, climb, 0.012, random) }, material);
      const wire = new THREE.LineSegments(wireGeometry(part.geometry, climb, scan, 0.035), wireMaterial);
      ring.add(tiles, wire);
      wires.push(wire);
      surfaces.push({ geometry: part.geometry, climb, share: part.slot === "Heads" ? 0.2 : 0.72 });
      disposables.push(material, tiles.geometry, wire.geometry);
    } else if (part.slot === "Gem 1") {
      const material = createPresetMaterial("diamond") as THREE.MeshPhysicalMaterial;
      applyStoneSweep(material, u);
      const stone = partToMesh(part, material);
      prepareGemTraceMesh(stone);
      const facets = new THREE.LineSegments(facetGeometry(part.geometry, scan, stoneBox.getCenter(new THREE.Vector3())), facetMaterial);
      seat.add(stone, facets);
      wires.push(facets);
      // The stone's points stay until the claws have closed on it.
      surfaces.push({ geometry: part.geometry, climb: () => 1.04, share: 0.08 });
      disposables.push(material, facets.geometry);
    }
  }
  ring.add(seat);

  const samples = surfaceSamples(surfaces, SWARM_POINTS, random);
  const discY = bandBox.min.y;
  const { swarm, material: swarmMaterial } = createSwarm(
    { orbit: galaxyOrbits(random), discY, target: samples.target, seed: landingSeeds(samples, random) },
    u,
  );
  const stringMaterial = createStringMaterial(discY, u);
  const strings = new THREE.LineSegments(galaxyStrings(GALAXY_STRINGS, STRING_SEGMENTS, random), stringMaterial);
  strings.frustumCulled = false;
  ring.add(swarm);
  // Its own seed, so the halo leaves the galaxy's layout as it was.
  const { halo, material: haloMaterial } = createHalo(galaxyHalo(seededRandom(11)), discY, u);
  holograms.push(swarmMaterial, stringMaterial, haloMaterial);
  disposables.push(strings.geometry);

  const gridStrength = uniform(0);
  const gridMaterial = createGridMaterial(u, gridStrength, GRID_EXTENT);
  const grid = new THREE.LineSegments(gridGeometry(ringBox.min.y - 4), gridMaterial);
  // Strings and workspace live beside the ring, so the floor's model bounds stay the ring's.
  const wash = createInkWash(discY, u);
  const workspace = new THREE.Group();
  workspace.add(wash, grid, strings, halo);
  holograms.push(gridMaterial);
  disposables.push(grid.geometry, wash.geometry, wash.material as THREE.Material, ...holograms);

  const group = new THREE.Group();
  group.scale.setScalar(MM);
  group.add(ring, workspace);

  recordFacts(built, stoneBox);

  const metals = REFORM_METALS.map((m) => (createPresetMaterial(m.id) as THREE.MeshPhysicalMaterial).color.clone());
  // The glint rig is shared by every traced gem on the site; it is restored on dispose.
  const savedGlints = gemGlintLights.array.map((v) => (v as THREE.Vector4).clone());

  const look = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const facing = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const light = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const stoneTop = stoneBox.max.y;
  const stoneDepth = stoneBox.max.y - stoneBox.min.y;
  let sway = 0;
  let swayAmount = 0;
  let frames = 0;
  let releases = story.releases;
  let pulseSlot = 0;

  function aim(camera: THREE.Camera, t: number, time: number) {
    const key = cameraKey(t);
    camera.position.set(Math.sin(key.angle) * key.radius, key.height, Math.cos(key.angle) * key.radius);
    // A slow handheld drift keeps the frame alive without breaking the chapter seams.
    camera.position.x += Math.sin(time * 0.31) * 0.06;
    camera.position.y += Math.sin(time * 0.23) * 0.04;
    camera.lookAt(look.set(0, key.look, 0));
    // While the swarm is free the camera leans with the pointer, so the disc has depth.
    const lean = 1 - ease(1.55, 2, t);
    if (lean > 0) {
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(right, story.pointer.x * 1.4 * lean).addScaledVector(up, -story.pointer.y * 0.8 * lean);
      camera.lookAt(look);
    }
    // Truck after aiming: the subject slides aside, the angle stays. Portrait screens stack
    // the copy over the subject instead, so they keep it centred.
    const wide = clamp01((story.vw / story.vh - 0.8) / 0.6);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(right, -key.shift * wide);
  }

  function build(i: number, p: number, time: number) {
    u.gather.value = gatherAt(i, p);
    // While the swarm is all free, keep the moment the gather would start from (see createSwarm).
    if (u.gather.value <= 0) {
      u.gatherClock.value = time;
      u.gatherSpin.value = u.spin.value;
    }
    u.wire.value = wireAt(i, p);
    u.climb.value = climbAt(i, p);
    u.sweep.value = stoneTop - sweepAt(i, p) * stoneDepth;
    u.sweepGlow.value = i === I.spark ? 4 * (1 - ease(0.74, 0.86, p)) : 0;
    seat.position.y = STONE_LIFT * hoverAt(i, p);
    const reform = reformAt(i, p);
    u.colorA.value.copy(metals[reform.from]!);
    u.colorB.value.copy(metals[reform.from + 1]!);
    u.swap.value = reform.front;
    u.swapGlow.value = i === I.reform ? 3.2 : 0;

    const hologram = hologramAt(i, p);
    u.pointsAlpha.value = hologram.points;
    u.wireAlpha.value = hologram.wire;
    gridStrength.value = hologram.grid;
    // Layers that have faded out are not drawn at all, so the finished piece renders clean.
    swarm.visible = hologram.points > 0;
    strings.visible = u.gather.value < 0.45;
    grid.visible = hologram.grid > 0;
    for (const wire of wires) wire.visible = hologram.wire > 0;
  }

  /**
   * The free swarm plays with the cursor: it stirs where the pointer moves, gathers into a
   * vortex while a button is held, and each release or tap sends a ripple out from that point.
   * Scrolling spins the disc. Landed points ignore all of it (see `createSwarm`).
   */
  function play(camera: THREE.Camera, i: number, time: number, dt: number) {
    const free = i <= I.points;
    const moved = story.pointer.x !== 0 || story.pointer.y !== 0;
    u.push.value = moved && free ? 7 : 0;
    u.attract.value += ((story.pressed && free ? 1 : 0) - u.attract.value) * (1 - Math.exp(-dt * 4));
    if (free) u.spin.value += dt * Math.min(Math.abs(story.velocity), 2) * 1.4;
    if (moved && free) locatePointer(camera);
    // Each release (or tap) starts its own ripple in the next slot; older ones keep going.
    for (; releases < story.releases; releases += 1) {
      if (!free) continue;
      pulseSlot = (pulseSlot + 1) % PULSES;
      const { x, y, z } = u.pointer.value;
      (u.pulses.array[pulseSlot] as THREE.Vector4).set(x, y, z, time);
    }
    u.now.value = time;
  }

  /** The cursor on the galaxy's plane while it is a disc; on a plane facing the camera once it is a ring. */
  function locatePointer(camera: THREE.Camera) {
    pointer.set(story.pointer.x, -story.pointer.y);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    if (u.gather.value < 0.3) plane.set(up.set(0, 1, 0), -discY * MM);
    else plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(facing), group.position);
    if (raycaster.ray.intersectPlane(plane, hit)) u.pointer.value.copy(ring.worldToLocal(hit));
  }

  /**
   * The finished ring sways on its stand — never round to the side, where a band reads
   * edge-on — and swings harder on a fast scroll. Before that it rests square to the keys.
   */
  function turn(i: number, dt: number) {
    const finished = i >= I.reform ? 1 : 0;
    sway += dt * (0.45 + Math.min(Math.abs(story.velocity) * 2, 2.5)) * finished;
    swayAmount += (finished - swayAmount) * (1 - Math.exp(-dt * 2));
    ring.rotation.y = Math.sin(sway) * 0.45 * swayAmount;
  }

  /** The cursor carries a pinpoint light. */
  function lightStone(i: number, p: number) {
    // Flares as the spark reaches the culet, and again as the stone seats in its claws.
    const flare = i === I.spark ? ease(0.62, 0.74, p) * (1 - ease(0.76, 0.84, p)) + ease(0.9, 0.95, p) * (1 - ease(0.96, 1, p)) : 0;
    const finale = i === I.start ? 1 + ease(0, 0.8, p) * 1.4 : 1;
    const glint = (1 + flare * 3) * finale;
    light.set(story.pointer.x * 1.5, 0.95 - story.pointer.y * 0.35, 0.75).normalize();
    (gemGlintLights.array[0] as THREE.Vector4).set(light.x, light.y, light.z, 34 * glint);
    (gemGlintLights.array[1] as THREE.Vector4).set(-light.x, light.y, light.z * 0.6, 22 * glint);
  }

  return {
    group,
    update(camera, time, dt) {
      frames += 1;
      if (frames === 4) story.ready = true;
      const { index: i, progress: p } = filmMoment();
      aim(camera, i + p, time);
      build(i, p, time);
      play(camera, i, time, dt);
      turn(i, dt);
      lightStone(i, p);
      return i >= I.reform;
    },
    setTheme(isLight) {
      u.light.value = isLight ? 1 : 0;
      themeHologram(holograms, isLight);
      wash.visible = isLight;
    },
    dispose() {
      savedGlints.forEach((v, i) => (gemGlintLights.array[i] as THREE.Vector4).copy(v));
      disposables.forEach((d) => d.dispose());
    },
  };
}
