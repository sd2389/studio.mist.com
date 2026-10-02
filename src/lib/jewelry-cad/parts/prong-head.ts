import * as THREE from "three";
import type { Vec2 } from "@/lib/stones/outlines";
import { capsuleAlongPath, smoothPath, tubeAlongLoop } from "@/lib/jewelry-cad/geometry/sweep";
import { outlineAt, rayToPolygon, type StoneModel } from "@/lib/jewelry-cad/stones/stone-model";

/**
 * Prong heads in the stone frame (girdle mid-plane y = 0, table +y).
 *
 * Each prong is one wire: it stands on the seat, climbs the pavilion a hair off the
 * stone, takes the girdle in a notch (the girdle bites `seat` into the wire), then bends
 * over the crown edge and ends in a rounded tip resting on the crown. A base ring ties the
 * feet together; the basket adds a gallery rail under the girdle.
 */

export type ProngHeadStyle = "4-prong" | "6-prong" | "basket";

export type ProngRecord = {
  /** Girdle point the prong grips (stone frame, y = 0). */
  girdlePoint: THREE.Vector3;
  /** Prong centreline, base → tip. */
  path: THREE.Vector3[];
  radius: number;
  /** Centre of the rounded tip and the tip radius. */
  tipCenter: THREE.Vector3;
  tipRadius: number;
};

export type HeadBuild = {
  parts: THREE.BufferGeometry[];
  prongs: ProngRecord[];
  /** Centrelines inside the head's metal that a halo can be soldered to. */
  carriers: THREE.Vector3[][];
  /** Lowest metal (the base ring bottom), stone frame. */
  bottomY: number;
  /** Half extents of the base footprint (x along the stone's length, z across). */
  footprint: { x: number; z: number };
};

export type ProngHeadInput = {
  stone: StoneModel;
  style: ProngHeadStyle;
  /** Height (stone frame) of the metal surface the head stands on. */
  seatY: number;
  /** Override the prong angles (degrees from +x toward +z). */
  angles?: number[];
};

const DEG = Math.PI / 180;

export function prongRadiusFor(stone: StoneModel, count: number): number {
  const base = THREE.MathUtils.clamp(0.078 * Math.min(stone.length, stone.width), 0.34, 0.8);
  return count > 4 ? base * 0.9 : base;
}

function diagonal(stone: StoneModel): number {
  return Math.atan2(stone.width, stone.length) / DEG;
}

/** Where the prongs go around each cut (degrees from the length axis). */
export function prongAngles(stone: StoneModel, count: 4 | 6): number[] {
  const d = diagonal(stone);
  switch (stone.cut) {
    case "marquise":
      return count === 4 ? [0, 90, 180, 270] : [0, 55, 125, 180, 235, 305];
    case "pear":
      return count === 4 ? [0, 110, 180, 250] : [0, 62, 125, 180, 235, 298];
    case "heart":
      return count === 4 ? [0, 118, 180, 242] : [0, 68, 125, 180, 235, 292];
    case "round":
      return count === 4 ? [45, 135, 225, 315] : [0, 60, 120, 180, 240, 300];
    default:
      return count === 4 ? [d, 180 - d, 180 + d, 360 - d] : [d, 90, 180 - d, 180 + d, 270, 360 - d];
  }
}

function v3(p: Vec2, y: number): THREE.Vector3 {
  return new THREE.Vector3(p.x, y, p.z);
}

function add2(p: Vec2, n: Vec2, k: number): Vec2 {
  return { x: p.x + n.x * k, z: p.z + n.z * k };
}

/** Radial distance of the pavilion at height y along angle theta (from a precomputed section). */
function pavilionRadius(sections: Map<number, Vec2[]>, stone: StoneModel, theta: number, y: number): number {
  let section = sections.get(y);
  if (!section) {
    section = stone.sectionAt(y);
    sections.set(y, section);
  }
  return section.length >= 3 ? rayToPolygon(section, theta) : 0;
}

function prongPath(stone: StoneModel, angleDeg: number, r: number, footY: number, footR: number, sections: Map<number, Vec2[]>): ProngRecord {
  const theta = angleDeg * DEG;
  const { point: g, normal: n } = outlineAt(stone, theta);
  const radial = { x: Math.cos(theta), z: Math.sin(theta) };
  const seat = 0.3 * r;
  const grip = add2(g, n, r - seat);
  const edgeY = Math.max(stone.girdleTop, stone.topAt(g.x - n.x * 0.03, g.z - n.z * 0.03) ?? stone.girdleTop);
  const rise = add2(g, n, (r - seat) * 0.8);
  const overEdge = add2(g, n, -0.05 * r);
  const tip = add2(g, n, -0.32 * r);
  const crownAt = (p: Vec2) => stone.topAt(p.x, p.z) ?? edgeY;
  const tipRadius = r * 0.92;

  const depth = stone.girdleBottom - stone.culetY;
  const hug = [0.32, 0.64].map((f) => {
    const y = stone.girdleBottom - f * depth;
    return v3(add2({ x: 0, z: 0 }, radial, pavilionRadius(sections, stone, theta, y) + r * 1.04), y);
  });
  const foot = v3(add2({ x: 0, z: 0 }, radial, footR), footY);
  const aboveFoot = v3(add2({ x: 0, z: 0 }, radial, footR * 1.02 + r * 0.2), footY + (hug[1]!.y - footY) * 0.45);

  const controls = [
    foot,
    aboveFoot,
    hug[1]!,
    hug[0]!,
    v3(grip, 0),
    v3(rise, edgeY + r * 0.7),
    v3(overEdge, crownAt(overEdge) + r * 0.86),
    v3(tip, crownAt(tip) + r * 0.84),
  ];
  const path = smoothPath(controls, 34);
  return { girdlePoint: v3(g, 0), path, radius: r, tipCenter: path[path.length - 1]!.clone(), tipRadius };
}

function loopThrough(points: THREE.Vector3[], samples: number): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  return curve.getSpacedPoints(samples).slice(0, samples);
}

/** Rail around the pavilion at height y, passing through the prongs' centrelines. */
function galleryRail(stone: StoneModel, y: number, offset: number, radius: number): THREE.BufferGeometry {
  const section = stone.sectionAt(y);
  const loop = Array.from({ length: 72 }, (_, i) => {
    const theta = (i / 72) * Math.PI * 2;
    const r = rayToPolygon(section, theta) + offset;
    return new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
  });
  return tubeAlongLoop(loop, radius, 10);
}

export function buildProngHead(input: ProngHeadInput): HeadBuild {
  const { stone, style } = input;
  const count = style === "6-prong" ? 6 : 4;
  const angles = input.angles ?? prongAngles(stone, count);
  const r = prongRadiusFor(stone, count);
  const ringRadius = r * 0.78;
  const footY = input.seatY + ringRadius * 0.35;
  const footR = Math.max(Math.min(stone.length, stone.width) * 0.2, r * 1.3) + r;
  const sections = new Map<number, Vec2[]>();

  const prongs = angles.map((a) => prongPath(stone, a, r, footY, footR, sections));
  const parts = prongs.map((p) => capsuleAlongPath(p.path, (t) => r * (1 - 0.08 * t), { radialSegments: 14 }));
  parts.push(tubeAlongLoop(loopThrough(prongs.map((p) => p.path[0]!), 56), ringRadius, 10));

  if (style === "basket") {
    const depth = stone.girdleBottom - stone.culetY;
    parts.push(galleryRail(stone, stone.girdleBottom - 0.4 * depth, r * 1.04, r * 0.62));
  }

  let fx = 0;
  let fz = 0;
  for (const p of prongs) {
    fx = Math.max(fx, Math.abs(p.path[0]!.x) + ringRadius);
    fz = Math.max(fz, Math.abs(p.path[0]!.z) + ringRadius);
  }
  return { parts, prongs, carriers: prongs.map((p) => p.path), bottomY: footY - ringRadius, footprint: { x: fx, z: fz } };
}
