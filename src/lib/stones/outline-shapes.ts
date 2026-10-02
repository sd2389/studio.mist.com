import { convexHull2D, type GirdleOutline, type Vec2 } from "@/lib/stones/outlines";

/**
 * Face-up outlines for each cut, as convex polygons (see `outlines.ts` for the frame and
 * the polygon utilities). Sizes are the stone's length (x) and width (z).
 *
 * Every outline is convex. Real hearts have a cleft between the lobes, but the ray-traced
 * gem shader needs convex stones, so the heart keeps its lobes and fills the cleft.
 */

const TAU = Math.PI * 2;

function smoothOutline(points: Vec2[]): GirdleOutline {
  return { points: convexHull2D(points), corners: [] };
}

function markCorners(points: Vec2[], thresholdDeg = 25): GirdleOutline {
  const corners: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n]!;
    const cur = points[i]!;
    const next = points[(i + 1) % n]!;
    const a1 = Math.atan2(cur.z - prev.z, cur.x - prev.x);
    const a2 = Math.atan2(next.z - cur.z, next.x - cur.x);
    let turn = Math.abs(a2 - a1);
    if (turn > Math.PI) turn = TAU - turn;
    if ((turn * 180) / Math.PI >= thresholdDeg) corners.push(i);
  }
  return { points, corners };
}

/** Circle of the given diameter. */
export function roundOutline(diameter: number, segments = 128): GirdleOutline {
  const r = diameter / 2;
  const points = Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * TAU;
    return { x: Math.cos(t) * r, z: Math.sin(t) * r };
  });
  return { points, corners: [] };
}

export function ovalOutline(length: number, width: number, segments = 128): GirdleOutline {
  const points = Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * TAU;
    return { x: (Math.cos(t) * length) / 2, z: (Math.sin(t) * width) / 2 };
  });
  return { points, corners: [] };
}

/** Rounded square / rectangle: a superellipse, the cushion's pillow outline. */
export function cushionOutline(length: number, width: number, exponent = 3, segments = 160): GirdleOutline {
  const e = 2 / exponent;
  const points = Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * TAU;
    const c = Math.cos(t), s = Math.sin(t);
    return {
      x: (Math.sign(c) * Math.abs(c) ** e * length) / 2,
      z: (Math.sign(s) * Math.abs(s) ** e * width) / 2,
    };
  });
  return smoothOutline(points);
}

/** Pointed arc from (x0, ±halfWidth) to the tip at (tipX, 0), tangent-horizontal at x0. */
function vesicaArc(x0: number, tipX: number, halfWidth: number, samples: number): Vec2[] {
  const run = Math.abs(tipX - x0);
  const radius = (run * run + halfWidth * halfWidth) / (2 * halfWidth);
  const out: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = x0 + ((tipX - x0) * i) / samples;
    const dx = x - x0;
    const z = Math.sqrt(Math.max(0, radius * radius - dx * dx)) - (radius - halfWidth);
    out.push({ x, z: Math.max(0, z) });
  }
  return out;
}

function mirrorAcrossLength(upper: Vec2[]): Vec2[] {
  return upper.concat(upper.map((p) => ({ x: p.x, z: -p.z })));
}

export function marquiseOutline(length: number, width: number, samples = 48): GirdleOutline {
  const hw = width / 2;
  const right = vesicaArc(0, length / 2, hw, samples);
  const left = vesicaArc(0, -length / 2, hw, samples);
  const hull = convexHull2D(mirrorAcrossLength(right.concat(left)));
  return markCorners(hull);
}

/** A semicircle on the round end (−x), as GIA describes the head; marquise wings to the point (+x). */
export function pearOutline(length: number, width: number, samples = 64): GirdleOutline {
  const hw = width / 2;
  // The widest point is the semicircle's centre line, half a width from the round end.
  const x0 = -length / 2 + Math.min(hw, length * 0.45);
  const roundRun = x0 + length / 2;
  const round: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * (Math.PI / 2);
    round.push({ x: x0 - Math.sin(t) * roundRun, z: Math.cos(t) * hw });
  }
  const point = vesicaArc(x0, length / 2, hw, samples);
  const hull = convexHull2D(mirrorAcrossLength(round.concat(point)));
  return markCorners(hull);
}

/** Every vertex is a true corner: the polygonal step-cut and fancy outlines. */
function polygonOutline(points: Vec2[]): GirdleOutline {
  const hull = convexHull2D(points);
  return { points: hull, corners: hull.map((_, i) => i) };
}

/** Stretch about the origin (which stays put) so the bounding box measures `length` × `width`. */
function fitExtents(points: Vec2[], length: number, width: number): Vec2[] {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const sx = length / (Math.max(...xs) - Math.min(...xs));
  const sz = width / (Math.max(...zs) - Math.min(...zs));
  return points.map((p) => ({ x: p.x * sx, z: p.z * sz }));
}

/**
 * Trillion (trilliant): a triangle with its apex on +x, centred on its incentre so the
 * culet sits under the middle. `bulge` bows each side outward by that fraction of its
 * length: 0 is the straight-sided side stone, ~0.07 the curved centre-stone trillion.
 */
export function trillionOutline(length: number, width: number, bulge = 0, samples = 12): GirdleOutline {
  // Circumradius 2, inradius 1, corners at 0°, 120°, 240° (counter-clockwise).
  const tips = [0, 1, 2].map((i) => ({ x: 2 * Math.cos((i * TAU) / 3), z: 2 * Math.sin((i * TAU) / 3) }));
  const points: Vec2[] = [];
  const corners: number[] = [];
  for (let side = 0; side < 3; side++) {
    const p0 = tips[side]!;
    const p1 = tips[(side + 1) % 3]!;
    const ex = p1.x - p0.x, ez = p1.z - p0.z;
    const len = Math.hypot(ex, ez);
    corners.push(points.length);
    const steps = bulge > 0 ? samples : 1;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      // A parabolic bow: indistinguishable from the cutter's arc at these sagittas.
      const sag = bulge * len * 4 * t * (1 - t);
      points.push({ x: p0.x + ex * t + (ez / len) * sag, z: p0.z + ez * t - (ex / len) * sag });
    }
  }
  return { points: fitExtents(points, length, width), corners };
}

/** Kite: long point on +x, short point on −x, widest `shoulder` of the length from the short point. */
export function kiteOutline(length: number, width: number, shoulder = 0.3): GirdleOutline {
  const xs = -length / 2 + length * shoulder;
  return polygonOutline([
    { x: length / 2, z: 0 },
    { x: xs, z: width / 2 },
    { x: -length / 2, z: 0 },
    { x: xs, z: -width / 2 },
  ]);
}

/**
 * Shield: a flat top on −x (`top` of the full width), widening to shoulders `shoulder` of
 * the length down, then two long sides converging on the point at +x.
 */
export function shieldOutline(length: number, width: number, top = 0.84, shoulder = 0.42): GirdleOutline {
  const xs = -length / 2 + length * shoulder;
  return polygonOutline([
    { x: length / 2, z: 0 },
    { x: xs, z: width / 2 },
    { x: -length / 2, z: (width / 2) * top },
    { x: -length / 2, z: -(width / 2) * top },
    { x: xs, z: -width / 2 },
  ]);
}

/**
 * Half moon: the straight edge along −z, a half ellipse toward +z. The arc is a polygon
 * because a step cut runs one row of steps along every girdle facet.
 */
export function halfMoonOutline(length: number, width: number, segments = 8): GirdleOutline {
  const points = Array.from({ length: segments + 1 }, (_, i) => {
    const t = (i / segments) * Math.PI;
    return { x: (Math.cos(t) * length) / 2, z: -width / 2 + Math.sin(t) * width };
  });
  return polygonOutline(points);
}

/** Hexagon with points on ±x. Corners stay 120°, so a longer stone simply has longer sides. */
export function hexagonOutline(length: number, width: number): GirdleOutline {
  const xs = length / 2 - width / (2 * Math.sqrt(3));
  return polygonOutline([
    { x: length / 2, z: 0 },
    { x: xs, z: width / 2 },
    { x: -xs, z: width / 2 },
    { x: -length / 2, z: 0 },
    { x: -xs, z: -width / 2 },
    { x: xs, z: -width / 2 },
  ]);
}

/** Octagon: corners cut so all eight sides are equal on a square stone. */
export function octagonOutline(length: number, width: number): GirdleOutline {
  return cutCornerOutline(length, width, Math.min(length, width) / (2 + Math.SQRT2));
}

/** Tapered baguette: the wide end on −x, narrowing to `taper` of the width at +x. */
export function taperedBaguetteOutline(length: number, width: number, taper = 0.65): GirdleOutline {
  return polygonOutline([
    { x: length / 2, z: (width * taper) / 2 },
    { x: -length / 2, z: width / 2 },
    { x: -length / 2, z: -width / 2 },
    { x: length / 2, z: -(width * taper) / 2 },
  ]);
}

/** Rectangle with 45° corner cuts (`corner` = cut length along each side). */
export function cutCornerOutline(length: number, width: number, corner: number): GirdleOutline {
  const a = length / 2, b = width / 2;
  const c = Math.min(corner, b * 0.95);
  const points: Vec2[] =
    c <= 1e-9
      ? [
          { x: a, z: -b },
          { x: a, z: b },
          { x: -a, z: b },
          { x: -a, z: -b },
        ]
      : [
          { x: a, z: -b + c },
          { x: a, z: b - c },
          { x: a - c, z: b },
          { x: -a + c, z: b },
          { x: -a, z: b - c },
          { x: -a, z: -b + c },
          { x: -a + c, z: -b },
          { x: a - c, z: -b },
        ];
  return { points, corners: points.map((_, i) => i) };
}

