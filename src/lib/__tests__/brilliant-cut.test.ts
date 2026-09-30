import { describe, expect, it } from "vitest";
import type * as THREE from "three";
import { buildBrilliantCut, IDEAL_ROUND_BRILLIANT, ROUND_OUTLINE } from "@/lib/stones/brilliant-cut";

/** Signed volume of a triangle soup; positive means outward-facing (CCW) winding. */
function signedVolume(g: THREE.BufferGeometry): number {
  const p = g.getAttribute("position");
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1);
    const cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/**
 * Every edge of a closed solid is shared by exactly two triangles. Refraction depends on
 * it: a ray that enters through a hole never finds a surface to exit through, which is
 * why a leaky gem path-traces to solid black.
 */
function nonManifoldEdges(g: THREE.BufferGeometry): number {
  const p = g.getAttribute("position");
  const key = (i: number) =>
    `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  const counts = new Map<string, number>();
  for (let i = 0; i < p.count; i += 3) {
    const k = [key(i), key(i + 1), key(i + 2)];
    for (let e = 0; e < 3; e++) {
      const edge = [k[e]!, k[(e + 1) % 3]!].sort().join("|");
      counts.set(edge, (counts.get(edge) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const n of counts.values()) if (n !== 2) bad++;
  return bad;
}

const CASES: Array<[string, () => THREE.BufferGeometry]> = [
  ["round brilliant", () => buildBrilliantCut(ROUND_OUTLINE, IDEAL_ROUND_BRILLIANT)],
];

describe("faceted cut geometry", () => {
  it.each(CASES)("%s is a closed solid", (_name, build) => {
    expect(nonManifoldEdges(build())).toBe(0);
  });

  it.each(CASES)("%s is wound outward", (_name, build) => {
    expect(signedVolume(build())).toBeGreaterThan(0);
  });
});
