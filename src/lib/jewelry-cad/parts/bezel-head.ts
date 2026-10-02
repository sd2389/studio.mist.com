import * as THREE from "three";
import { offsetOutline, resampleClosed, type Vec2 } from "@/lib/stones/outlines";
import { sweepRings, type Ring } from "@/lib/jewelry-cad/geometry/sweep";
import { rayToPolygon, type StoneModel } from "@/lib/jewelry-cad/stones/stone-model";
import type { HeadBuild } from "@/lib/jewelry-cad/parts/prong-head";

/**
 * Bezel: a metal collar swept around the girdle. The inner wall touches the girdle, the
 * lip rolls 0.3 mm over the crown edge, and below the girdle the cup follows the pavilion
 * down to the seat. Inward positions scale toward the stone's centre (never an inward
 * normal offset), so sharp corners — princess, marquise tips — cannot fold the wall.
 */

export type BezelInput = {
  stone: StoneModel;
  /** Height (stone frame) of the metal surface the cup stands on. */
  seatY: number;
  wall?: number;
  lip?: number;
};

type ProfilePoint = { scale: number; offset: number; y: number };

const SAMPLES = 96;

export function bezelWallFor(stone: StoneModel): number {
  return THREE.MathUtils.clamp(0.1 * Math.min(stone.length, stone.width), 0.5, 0.9);
}

function profileAt(stone: StoneModel, p: Vec2, sections: Vec2[][], levels: number[], seatY: number, wall: number, lip: number): ProfilePoint[] {
  const theta = Math.atan2(p.z, p.x);
  const reach = Math.hypot(p.x, p.z);
  const lipScale = Math.max(0.4, 1 - lip / reach);
  const crown = stone.topAt(p.x * lipScale, p.z * lipScale) ?? stone.girdleTop;
  const lipBottom = crown + 0.03;
  const top = lipBottom + 0.34;
  const bottom = seatY - 0.25;
  const pav = levels.map((y, i) => ({ y, scale: Math.max(0.12, (rayToPolygon(sections[i]!, theta) + 0.12) / reach) }));
  const bottomScale = Math.max(0.16, pav[pav.length - 1]!.scale * 0.9);
  const outerBottomScale = Math.min(1, bottomScale + (wall * 1.6) / reach);
  return [
    { scale: lipScale, offset: 0, y: lipBottom },
    { scale: lipScale + (1 - lipScale) * 0.25, offset: 0, y: top },
    { scale: 1, offset: wall * 0.8, y: top + 0.02 },
    { scale: 1, offset: wall, y: top - 0.28 },
    { scale: 1, offset: wall, y: stone.girdleBottom - 0.4 },
    { scale: outerBottomScale, offset: wall * 0.5, y: bottom + 0.2 },
    { scale: outerBottomScale, offset: 0, y: bottom },
    { scale: bottomScale, offset: 0, y: bottom },
    ...pav.slice().reverse().map((q) => ({ scale: q.scale, offset: 0, y: q.y })),
    { scale: 1, offset: 0, y: stone.girdleBottom - 0.02 },
    { scale: 1, offset: 0, y: stone.girdleTop + 0.02 },
  ];
}

/** Vertical lines through the middle of the wall, from the girdle to the seat. */
function wallCarriers(stone: StoneModel, wall: number, seatY: number): THREE.Vector3[][] {
  return Array.from({ length: 8 }, (_, i) => {
    const theta = ((i + 0.5) / 8) * Math.PI * 2;
    const r = rayToPolygon(stone.outline.points, theta) + wall * 0.5;
    const at = (y: number) => new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
    return [at(stone.girdleTop), at(stone.girdleBottom - 0.4), at(Math.max(seatY, stone.girdleBottom - 1.2))];
  });
}

export function buildBezelHead(input: BezelInput): HeadBuild {
  const { stone, seatY } = input;
  const wall = input.wall ?? bezelWallFor(stone);
  const lip = input.lip ?? 0.3;
  const girdle = resampleClosed(stone.outline.points, SAMPLES);
  // Outward direction per sample: from a miter offset of the girdle itself.
  const outward = offsetOutline({ points: girdle, corners: [] }, 1).map((q, i) => ({
    x: q.x - girdle[i]!.x,
    z: q.z - girdle[i]!.z,
  }));
  const depth = stone.girdleBottom - stone.culetY;
  const levels = [0.3, 0.62, 0.86].map((f) => stone.girdleBottom - f * depth);
  const sections = levels.map((y) => stone.sectionAt(y));

  const rings: Ring[] = girdle.map((p, i) => {
    const n = outward[i]!;
    return profileAt(stone, p, sections, levels, seatY, wall, lip).map(
      (q) => new THREE.Vector3(p.x * q.scale + n.x * q.offset, q.y, p.z * q.scale + n.z * q.offset),
    );
  });
  const geometry = sweepRings(rings, { closed: true });
  const reachX = Math.max(...girdle.map((p) => Math.abs(p.x)));
  const reachZ = Math.max(...girdle.map((p) => Math.abs(p.z)));
  return {
    parts: [geometry],
    prongs: [],
    carriers: wallCarriers(stone, wall, seatY),
    bottomY: seatY - 0.25,
    footprint: { x: reachX * 0.5 + wall, z: reachZ * 0.5 + wall },
  };
}
