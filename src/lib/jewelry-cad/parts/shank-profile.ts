import type { Vec2 } from "@/lib/stones/outlines";

/**
 * Ring cross-sections. Coordinates are (v, u): v across the band (along the finger), u
 * outward from the inside surface. Every profile is convex, closed, and its innermost
 * point sits exactly at u = 0 so the finger hole is the size the customer ordered.
 */

export type ShankProfileId = "comfort" | "d-shape" | "flat" | "knife-edge";

type ControlPoint = Vec2 & { corner?: number };

function vu(v: number, u: number, corner?: number): ControlPoint {
  return corner === undefined ? { x: v, z: u } : { x: v, z: u, corner };
}

/** Closed Chaikin corner cutting: converges to a quadratic B-spline of the polygon. */
function chaikin(points: Vec2[], iterations: number): Vec2[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const out: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    pts = out;
  }
  return pts;
}

/**
 * Put control points `2r` either side of each flagged corner so the spline rounds it with
 * a fillet of roughly radius r and leaves the neighbouring straight runs straight.
 */
function withFillets(points: ControlPoint[]): Vec2[] {
  const out: Vec2[] = [];
  const n = points.length;
  points.forEach((p, i) => {
    if (p.corner === undefined) {
      out.push(p);
      return;
    }
    const prev = points[(i + n - 1) % n]!;
    const next = points[(i + 1) % n]!;
    const along = (q: Vec2) => {
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      const d = Math.min(2 * p.corner!, len * 0.45);
      return { x: p.x + ((q.x - p.x) / len) * d, z: p.z + ((q.z - p.z) / len) * d };
    };
    out.push(along(prev), { x: p.x, z: p.z }, along(next));
  });
  return out;
}

function sampleCurve(fromV: number, toV: number, count: number, u: (v: number) => number): ControlPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const v = fromV + ((toV - fromV) * (i + 1)) / (count + 1);
    return vu(v, u(v));
  });
}

function controlPolygon(profile: ShankProfileId, w: number, t: number): ControlPoint[] {
  const h = w / 2;
  const edge = Math.min(0.32, t * 0.28, w * 0.2);
  switch (profile) {
    case "flat":
      return [vu(-h, 0, edge), vu(h, 0, edge), vu(h, t, edge), vu(-h, t, edge)];
    case "comfort": {
      // Court profile: domed outside, gently domed inside for comfort.
      const lift = Math.min(0.35, t * 0.16);
      const dome = t * 0.3;
      const inner = (v: number) => lift * ((2 * v) / w) ** 2;
      const outer = (v: number) => t - dome * ((2 * v) / w) ** 2;
      return [
        vu(-h, inner(-h), edge),
        ...sampleCurve(-h, h, 4, inner),
        vu(h, inner(h), edge),
        vu(h, outer(h), edge),
        ...sampleCurve(h, -h, 4, outer),
        vu(-h, outer(-h), edge),
      ];
    }
    case "d-shape": {
      const side = t * 0.32;
      const outer = (v: number) => side + (t - side) * Math.sqrt(Math.max(0, 1 - ((2 * v) / w) ** 2));
      return [vu(-h, 0, edge), vu(h, 0, edge), vu(h, side), ...sampleCurve(h, -h, 6, outer), vu(-h, side)];
    }
    case "knife-edge": {
      const side = t * 0.4;
      return [vu(-h, 0, edge), vu(h, 0, edge), vu(h, side, edge), vu(0, t, Math.min(0.12, w * 0.05)), vu(-h, side, edge)];
    }
  }
}

/** Point count is fixed per profile type, so rings of any width/thickness can be stitched. */
export function shankProfile(profile: ShankProfileId, width: number, thickness: number): Vec2[] {
  const smooth = chaikin(withFillets(controlPolygon(profile, width, thickness)), 2);
  const minU = Math.min(...smooth.map((p) => p.z));
  return smooth.map((p) => ({ x: p.x, z: p.z - minU }));
}

/** Outer surface height (u) of a convex profile above band position v. */
export function profileTopAt(profile: Vec2[], v: number): number {
  let best = 0;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    if ((a.x - v) * (b.x - v) > 0 || a.x === b.x) continue;
    const k = (v - a.x) / (b.x - a.x);
    best = Math.max(best, a.z + (b.z - a.z) * k);
  }
  return best;
}
