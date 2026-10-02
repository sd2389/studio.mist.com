import * as THREE from "three";
import { capsuleAlongPath, sphereGeometry, sweepRings, type Ring } from "@/lib/jewelry-cad/geometry/sweep";
import { angleFromTop, type ShankSurface } from "@/lib/jewelry-cad/parts/shank";
import { shankProfile } from "@/lib/jewelry-cad/parts/shank-profile";
import { buildMeleeModel, type StoneModel } from "@/lib/jewelry-cad/stones/stone-model";

/**
 * Stones set into the band itself, in the ring frame (finger along z, top = +y).
 *
 * - pavé: melee sized to the band (a metal border either side), bead-set — every gap gets
 *   a bead on each edge that bites both neighbours' girdles;
 * - channel: stones almost touching, held under two rails along the band edges;
 * - eternity: larger stones all the way (or half-way) round, shared prongs in each gap.
 *
 * Stones sit with their girdle just under the band's surface; the pavilions are carried
 * inside the metal (seats are not cut — see the exporter notes).
 */

export type BandStoneKind = "pave" | "channel" | "eternity";

export type BandStonesInput = {
  shank: ShankSurface;
  kind: BandStoneKind;
  /** Angle from the top where the stones start (radians) — keeps clear of the head. */
  startAngle: number;
  /** Angle from the top where they stop; π means all the way round. */
  endAngle: number;
  /** Stone diameter override (eternity sizes stones from the band width). */
  diameter?: number;
};

export type BandStonesBuild = {
  metal: THREE.BufferGeometry[];
  stones: THREE.Matrix4[];
  model: StoneModel;
};

const TOP = Math.PI / 2;
const GAP: Record<BandStoneKind, number> = { pave: 0.14, channel: 0.06, eternity: 0.2 };

/** Melee diameter that leaves a metal border on a band of this width. */
export function paveDiameterFor(minWidth: number): number {
  return THREE.MathUtils.clamp(minWidth - 0.7, 0.8, 2.4);
}

/** Channel stones leave room for the two rails. */
export function channelDiameterFor(minWidth: number): number {
  return THREE.MathUtils.clamp(minWidth - 0.64, 0.9, 3.2);
}

export function eternityDiameterFor(width: number): number {
  return THREE.MathUtils.clamp(width - 0.45, 1.0, 4.5);
}

function radial(phi: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
}

function stoneMatrix(phi: number, girdleRadius: number): THREE.Matrix4 {
  const y = radial(phi);
  const x = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(y.clone().multiplyScalar(girdleRadius));
}

/** Stone angles on one side of the ring (or all round), evenly spaced. */
function stoneAngles(input: BandStonesInput, girdleRadius: number, d: number): number[] {
  const step = (d + GAP[input.kind]) / girdleRadius;
  if (input.endAngle >= Math.PI - 1e-6 && input.startAngle <= 1e-6) {
    const count = Math.floor((Math.PI * 2) / step);
    return Array.from({ length: count }, (_, i) => TOP + (i / count) * Math.PI * 2);
  }
  if (input.startAngle <= 1e-6) {
    // Half eternity: one stone dead on top, the rest mirrored down both sides.
    const out = [TOP];
    for (let i = 1; i * step <= input.endAngle; i++) out.push(TOP + i * step, TOP - i * step);
    return out;
  }
  const first = input.startAngle + d / 2 / girdleRadius;
  const out: number[] = [];
  for (let a = first; a <= input.endAngle; a += step) out.push(TOP + a, TOP - a);
  return out;
}

function surfacePoint(shank: ShankSurface, phi: number, v: number, lift: number): THREE.Vector3 {
  return radial(phi).multiplyScalar(shank.outerRadiusAt(phi, v) + lift).setZ(v);
}

function beadsFor(shank: ShankSurface, angles: number[], d: number, gapAngle: number): THREE.BufferGeometry[] {
  const bead = Math.max(0.18, 0.21 * d);
  const at = new Set<number>();
  for (const a of angles) {
    at.add(Math.round((a + gapAngle) * 1e6) / 1e6);
    at.add(Math.round((a - gapAngle) * 1e6) / 1e6);
  }
  const out: THREE.BufferGeometry[] = [];
  for (const phi of at) {
    for (const side of [-1, 1]) {
      out.push(sphereGeometry(surfacePoint(shank, phi, side * (d / 2) * 0.82, bead * 0.3), bead, 12, 7));
    }
  }
  return out;
}

/** Rounded rail along the band edge, from angle a0 to a1, tapering shut at both ends. */
function channelRail(shank: ShankSurface, a0: number, a1: number, v: number, top: number): THREE.BufferGeometry {
  const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 0.02));
  const width = 0.38;
  const rings: Ring[] = [];
  for (let k = 0; k <= steps; k++) {
    const phi = a0 + ((a1 - a0) * k) / steps;
    const ends = Math.min(k, steps - k);
    const shrink = ends >= 3 ? 1 : Math.sqrt(Math.max(0.05, ends / 3));
    const base = shank.outerRadiusAt(phi, v) - 0.35;
    const height = top - base;
    const profile = shankProfile("comfort", width * shrink, height * (0.6 + 0.4 * shrink));
    const e = radial(phi);
    rings.push(profile.map((p) => e.clone().multiplyScalar(base + p.z).setZ(v + p.x)));
  }
  return sweepRings(rings.slice(1, -1), {
    startPole: radial(a0).multiplyScalar(shank.outerRadiusAt(a0, v) - 0.1).setZ(v),
    endPole: radial(a1).multiplyScalar(shank.outerRadiusAt(a1, v) - 0.1).setZ(v),
  });
}

function sharedProngs(shank: ShankSurface, angles: number[], d: number, gapAngle: number, girdleRadius: number, model: StoneModel): THREE.BufferGeometry[] {
  const r = Math.max(0.2, 0.17 * d);
  const out: THREE.BufferGeometry[] = [];
  for (const a of angles) {
    const phi = a + gapAngle;
    for (const side of [-1, 1]) {
      const v = side * (d / 2) * 0.9;
      const base = radial(phi).multiplyScalar(girdleRadius - 0.35).setZ(v);
      const mid = radial(phi).multiplyScalar(girdleRadius + model.girdleTop + r * 0.2).setZ(v * 1.02);
      const tip = radial(phi).multiplyScalar(girdleRadius + model.girdleTop + r * 0.85).setZ(v * 0.86);
      out.push(capsuleAlongPath([base, mid, tip], r, { radialSegments: 12 }));
    }
  }
  return out;
}

export function buildBandStones(input: BandStonesInput): BandStonesBuild {
  const { shank, kind } = input;
  const minWidth = shank.widthAt(TOP + input.startAngle);
  const d = input.diameter ?? (kind === "channel" ? channelDiameterFor(minWidth) : paveDiameterFor(minWidth));
  const model = buildMeleeModel(d);
  // Girdle top 0.04 mm under the band surface: the crown stands proud, beads grip the edge.
  const girdleRadius = shank.outerRadiusAt(TOP, 0) - model.girdleTop - 0.04;
  const angles = stoneAngles(input, girdleRadius, d);
  const stones = angles.map((phi) => stoneMatrix(phi, shank.outerRadiusAt(phi, 0) - model.girdleTop - 0.04));
  const gapAngle = (d + GAP[kind]) / 2 / girdleRadius;

  let metal: THREE.BufferGeometry[] = [];
  if (kind === "pave") metal = beadsFor(shank, angles, d, gapAngle);
  if (kind === "eternity") metal = sharedProngs(shank, angles, d, gapAngle, girdleRadius, model);
  if (kind === "channel" && angles.length > 0) {
    const top = girdleRadius + model.girdleTop + 0.32;
    for (const sign of [-1, 1]) {
      const sideAngles = angles.filter((a) => Math.sign(a - TOP) === sign);
      if (sideAngles.length === 0) continue;
      const from = Math.min(...sideAngles.map(angleFromTop)) - gapAngle * 1.2;
      const to = Math.max(...sideAngles.map(angleFromTop)) + gapAngle * 1.2;
      for (const v of [-(d / 2 + 0.1), d / 2 + 0.1]) {
        metal.push(channelRail(shank, TOP + sign * from, TOP + sign * to, v, top));
      }
    }
  }
  return { metal, stones, model };
}
