import type { Vec2 } from "@/lib/stones/outlines";

/** Arc-length sampling of closed 2D curves in the (x, z) plane, CCW. */

export type PathSample = {
  point: Vec2;
  tangent: Vec2;
  /** Outward normal (tangent turned clockwise for a CCW curve). */
  normal: Vec2;
};

/** Rotate a closed polyline so it starts where it crosses the +x axis (for symmetric layouts). */
export function startAtPositiveX(points: Vec2[]): Vec2[] {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    if (a.z <= 0 && b.z > 0 && (a.x > 0 || b.x > 0)) {
      const t = -a.z / (b.z - a.z);
      const crossing = { x: a.x + (b.x - a.x) * t, z: 0 };
      const rest = [...points.slice(i + 1), ...points.slice(0, i + 1)];
      return t >= 1 - 1e-9 ? rest : [crossing, ...rest];
    }
  }
  return points;
}

export function closedLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Sample a closed curve at arc lengths `s` (wrapping), with tangent and outward normal. */
export function sampleClosedAt(points: Vec2[], lengths: number[]): PathSample[] {
  const n = points.length;
  const cumulative = [0];
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    cumulative.push(cumulative[i]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cumulative[n]!;
  return lengths.map((raw) => {
    const s = ((raw % total) + total) % total;
    let seg = 0;
    while (seg < n - 1 && cumulative[seg + 1]! < s) seg++;
    const a = points[seg]!;
    const b = points[(seg + 1) % n]!;
    const len = cumulative[seg + 1]! - cumulative[seg]! || 1;
    const t = (s - cumulative[seg]!) / len;
    // Smooth the tangent across the vertex so dense curves do not facet the frame.
    const prev = points[(seg + n - 1) % n]!;
    const next = points[(seg + 2) % n]!;
    const t0 = { x: b.x - prev.x, z: b.z - prev.z };
    const t1 = { x: next.x - a.x, z: next.z - a.z };
    const tx = t0.x * (1 - t) + t1.x * t, tz = t0.z * (1 - t) + t1.z * t;
    const tl = Math.hypot(tx, tz) || 1;
    const tangent = { x: tx / tl, z: tz / tl };
    return {
      point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
      tangent,
      normal: { x: tangent.z, z: -tangent.x },
    };
  });
}

export function sampleClosedEvenly(points: Vec2[], count: number, phase = 0): PathSample[] {
  const total = closedLength(points);
  return sampleClosedAt(
    points,
    Array.from({ length: count }, (_, i) => ((i + phase) / count) * total),
  );
}
