/**
 * Girdle outlines — the face-up silhouette of a cut, as a convex polygon in the stone's
 * girdle plane — and the polygon utilities settings are built from (sampling by arc
 * length, offsets, ray casts). `x` runs along the stone's length, `z` along its width,
 * origin at the girdle centre, units of the caller's choosing (mm in the CAD library).
 * The shapes themselves live in `outline-shapes.ts`.
 */

export type Vec2 = { x: number; z: number };

/** A closed convex polygon, counter-clockwise, with optional sharp corners marked. */
export type GirdleOutline = {
  points: Vec2[];
  /** Indices of points where the outline has a true corner (princess, marquise tips…). */
  corners: number[];
};

const TAU = Math.PI * 2;

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

/** Andrew's monotone chain; returns the CCW hull without collinear points. */
export function convexHull2D(input: Vec2[]): Vec2[] {
  const pts = [...input].sort((a, b) => a.x - b.x || a.z - b.z);
  if (pts.length < 3) return pts;
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Distance from the origin to the outline along direction `theta`. */
export function outlineRadiusAt(outline: GirdleOutline, theta: number): number {
  const dx = Math.cos(theta), dz = Math.sin(theta);
  const pts = outline.points;
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const ex = b.x - a.x, ez = b.z - a.z;
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-14) continue;
    const t = (a.x * ez - a.z * ex) / denom;
    const s = (a.x * dz - a.z * dx) / denom;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}

export function outlinePerimeter(outline: GirdleOutline): number {
  const pts = outline.points;
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

export type OutlineSample = {
  point: Vec2;
  /** Outward unit normal of the outline at this point (bisector at a corner). */
  normal: Vec2;
};

export function edgeNormal(a: Vec2, b: Vec2): Vec2 {
  const ex = b.x - a.x, ez = b.z - a.z;
  const len = Math.hypot(ex, ez) || 1;
  // CCW polygon: outward normal is the edge direction rotated clockwise.
  return { x: ez / len, z: -ex / len };
}

/**
 * Where the outline crosses the +x axis: the arc-length origin, so symmetric shapes get
 * symmetric facet layouts.
 */
function positiveXCrossing(outline: GirdleOutline): { edge: number; t: number } {
  const pts = outline.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if (a.z <= 0 && b.z > 0 && (a.x > 0 || b.x > 0)) {
      return { edge: i, t: -a.z / (b.z - a.z) };
    }
  }
  return { edge: 0, t: 0 };
}

/** Point + outward normal at arc-length fraction `f` (0..1), measured from the +x axis. */
export function sampleOutline(outline: GirdleOutline, f: number): OutlineSample {
  const pts = outline.points;
  const n = pts.length;
  const origin = positiveXCrossing(outline);
  const perimeter = outlinePerimeter(outline);
  const first = pts[origin.edge]!;
  const second = pts[(origin.edge + 1) % n]!;
  // Arc length already consumed on the starting edge before the axis crossing.
  let remaining = (((f % 1) + 1) % 1) * perimeter + origin.t * Math.hypot(second.x - first.x, second.z - first.z);
  for (let step = 0; step <= n; step++) {
    const i = (origin.edge + step) % n;
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= len || step === n) {
      const t = len > 0 ? Math.min(1, remaining / len) : 0;
      return { point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, normal: edgeNormal(a, b) };
    }
    remaining -= len;
  }
  return { point: pts[0]!, normal: { x: 1, z: 0 } };
}

/** Evenly spaced (by arc length) samples starting at the +x tip. */
export function sampleOutlineEvenly(outline: GirdleOutline, count: number): OutlineSample[] {
  return Array.from({ length: count }, (_, i) => sampleOutline(outline, i / count));
}

/**
 * Arc length from vertex `from` to vertex `to`, walking counter-clockwise (the whole
 * perimeter when they are the same vertex).
 */
export function arcBetween(outline: GirdleOutline, from: number, to: number): number {
  const pts = outline.points;
  const n = pts.length;
  let total = 0;
  let i = from;
  do {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
    i = (i + 1) % n;
  } while (i !== to);
  return total;
}

/** Point + outward edge normal at arc length `s` counter-clockwise from vertex `start`. */
export function sampleFromVertex(outline: GirdleOutline, start: number, s: number): OutlineSample {
  const pts = outline.points;
  const n = pts.length;
  const perimeter = outlinePerimeter(outline);
  let remaining = ((s % perimeter) + perimeter) % perimeter;
  for (let step = 0; step < n; step++) {
    const a = pts[(start + step) % n]!;
    const b = pts[(start + step + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= len || step === n - 1) {
      const t = len > 0 ? Math.min(1, remaining / len) : 0;
      return { point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, normal: edgeNormal(a, b) };
    }
    remaining -= len;
  }
  return { point: pts[start]!, normal: edgeNormal(pts[start]!, pts[(start + 1) % n]!) };
}

/** Distance from the origin to the nearest edge line: the inscribed radius about the origin. */
export function outlineInradius(outline: GirdleOutline): number {
  const pts = outline.points;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const n = edgeNormal(a, pts[(i + 1) % pts.length]!);
    best = Math.min(best, a.x * n.x + a.z * n.z);
  }
  return best;
}

/** Outward normal at vertex `i`: the bisector of its two edges. */
export function vertexNormal(outline: GirdleOutline, i: number): Vec2 {
  const pts = outline.points;
  const n = pts.length;
  const n1 = edgeNormal(pts[(i + n - 1) % n]!, pts[i]!);
  const n2 = edgeNormal(pts[i]!, pts[(i + 1) % n]!);
  const x = n1.x + n2.x, z = n1.z + n2.z;
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

/**
 * Offset the outline outward by `distance` (> 0). Corners get a miter capped at 2×, so
 * a marquise tip grows a short point instead of a spike.
 */
export function offsetOutline(outline: GirdleOutline, distance: number): Vec2[] {
  const pts = outline.points;
  const n = pts.length;
  return pts.map((p, i) => {
    const n1 = edgeNormal(pts[(i + n - 1) % n]!, p);
    const n2 = edgeNormal(p, pts[(i + 1) % n]!);
    const bx = n1.x + n2.x, bz = n1.z + n2.z;
    const blen = Math.hypot(bx, bz) || 1;
    const nx = bx / blen, nz = bz / blen;
    const cosHalf = Math.max(0.5, nx * n1.x + nz * n1.z);
    const d = distance / cosHalf;
    return { x: p.x + nx * d, z: p.z + nz * d };
  });
}

/**
 * Offset outward by `distance` with round joins: sharp corners become arcs of that
 * radius. Anything swept along the result can safely reach up to `distance` back inward
 * without folding over itself.
 */
export function offsetOutlineRound(outline: GirdleOutline, distance: number, arcStepDeg = 12): Vec2[] {
  const pts = outline.points;
  const n = pts.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const n1 = edgeNormal(pts[(i + n - 1) % n]!, p);
    const n2 = edgeNormal(p, pts[(i + 1) % n]!);
    const a1 = Math.atan2(n1.z, n1.x);
    let a2 = Math.atan2(n2.z, n2.x);
    while (a2 < a1) a2 += TAU;
    const turn = a2 - a1;
    const steps = turn > (5 * Math.PI) / 180 ? Math.max(1, Math.ceil((turn * 180) / Math.PI / arcStepDeg)) : 0;
    if (steps === 0) {
      const bx = n1.x + n2.x, bz = n1.z + n2.z;
      const len = Math.hypot(bx, bz) || 1;
      out.push({ x: p.x + (bx / len) * distance, z: p.z + (bz / len) * distance });
      continue;
    }
    for (let k = 0; k <= steps; k++) {
      const a = a1 + (turn * k) / steps;
      out.push({ x: p.x + Math.cos(a) * distance, z: p.z + Math.sin(a) * distance });
    }
  }
  return out;
}

/** Scale the outline toward its centre (a shrink that can never self-intersect). */
export function scaleOutline(outline: GirdleOutline, sx: number, sz = sx): GirdleOutline {
  return {
    points: outline.points.map((p) => ({ x: p.x * sx, z: p.z * sz })),
    corners: outline.corners,
  };
}

/** Resample a closed polyline to `count` points evenly spaced by arc length. */
export function resampleClosed(points: Vec2[], count: number): Vec2[] {
  const n = points.length;
  const cumulative = [0];
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    cumulative.push(cumulative[i]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cumulative[n]!;
  const out: Vec2[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (seg < n - 1 && cumulative[seg + 1]! < target) seg++;
    const a = points[seg]!;
    const b = points[(seg + 1) % n]!;
    const len = cumulative[seg + 1]! - cumulative[seg]!;
    const t = len > 0 ? (target - cumulative[seg]!) / len : 0;
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

export function outlineExtents(outline: GirdleOutline): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of outline.points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}
