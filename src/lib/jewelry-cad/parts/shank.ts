import * as THREE from "three";
import { sweepRings, type Ring } from "@/lib/jewelry-cad/geometry/sweep";
import { profileTopAt, shankProfile, type ShankProfileId } from "@/lib/jewelry-cad/parts/shank-profile";

/**
 * Ring shank: a cross-section swept once around the finger.
 *
 * Ring frame (mm): the finger runs along z, the ring's centre is the origin and the top
 * of the ring (where a head sits) is +y. Angle φ is measured from +x toward +y, so the
 * top is φ = 90°. The sweep starts at the bottom so the UV seam hides under the finger.
 */

export type CathedralShoulders = {
  /** Extra radial height at the arch peaks (mm). */
  height: number;
  /** Angle from the top where the arches peak (radians). */
  peak: number;
  /** Angle from the top where the arches have fully melted back into the band (radians). */
  spread: number;
  /** Rise allowed right under the stone, so the arch never touches the culet (mm). */
  centerRise: number;
};

export type ShankParams = {
  innerRadius: number;
  width: number;
  thickness: number;
  profile: ShankProfileId;
  /** 0..0.6 — fraction of the width lost at the top (the head). */
  taper: number;
  cathedral?: CathedralShoulders | null;
  segments?: number;
};

/** The band's outer surface, for placing things on it. */
export type ShankSurface = {
  widthAt(phi: number): number;
  /** Outer surface radius at angle φ and band position v (across the band). */
  outerRadiusAt(phi: number, v: number): number;
};

export type Shank = ShankSurface & {
  geometry: THREE.BufferGeometry;
  params: ShankParams;
  thicknessAt(phi: number): number;
};

const TOP = Math.PI / 2;

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Angular distance from the top of the ring, 0..π. */
export function angleFromTop(phi: number): number {
  const d = Math.abs((((phi - TOP) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  return d;
}

function cathedralLift(c: CathedralShoulders, phi: number): number {
  const d = angleFromTop(phi);
  if (d >= c.spread) return 0;
  if (d >= c.peak) return c.height * smoothstep((c.spread - d) / (c.spread - c.peak));
  // Under the head the arch dips back down so the stone's culet keeps its clearance.
  const k = smoothstep(d / c.peak);
  return c.centerRise + (c.height - c.centerRise) * k;
}

export function shankWidthAt(params: ShankParams, phi: number): number {
  const up = Math.max(0, Math.sin(phi));
  return params.width * (1 - params.taper * up * up);
}

export function shankThicknessAt(params: ShankParams, phi: number): number {
  return params.thickness + (params.cathedral ? cathedralLift(params.cathedral, phi) : 0);
}

/** Outer surface radius at angle φ and band position v, without building the mesh. */
export function shankOuterRadius(params: ShankParams, phi: number, v: number): number {
  return params.innerRadius + profileTopAt(shankProfile(params.profile, shankWidthAt(params, phi), shankThicknessAt(params, phi)), v);
}

export function shankSurface(params: ShankParams): ShankSurface {
  return {
    widthAt: (phi) => shankWidthAt(params, phi),
    outerRadiusAt: (phi, v) => shankOuterRadius(params, phi, v),
  };
}

export function buildShank(params: ShankParams): Shank {
  const segments = params.segments ?? 168;
  const rings: Ring[] = [];
  for (let k = 0; k < segments; k++) {
    const phi = -TOP + (k / segments) * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
    const profile = shankProfile(params.profile, shankWidthAt(params, phi), shankThicknessAt(params, phi));
    rings.push(
      profile.map((p) => new THREE.Vector3(0, 0, p.x).addScaledVector(radial, params.innerRadius + p.z)),
    );
  }
  const geometry = sweepRings(rings, { closed: true });
  return {
    geometry,
    params,
    widthAt: (phi) => shankWidthAt(params, phi),
    thicknessAt: (phi) => shankThicknessAt(params, phi),
    outerRadiusAt: (phi, v) => shankOuterRadius(params, phi, v),
  };
}
