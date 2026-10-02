import { describe, expect, it } from "vitest";
import { analyzeEdges, signedVolume, splitIslands, usSizeToInnerDiameterMm } from "@/lib/jewelry-cad";
import { buildShank, shankOuterRadius } from "@/lib/jewelry-cad/parts/shank";
import type { ShankProfileId } from "@/lib/jewelry-cad/parts/shank-profile";

const PROFILES: ShankProfileId[] = ["comfort", "d-shape", "flat", "knife-edge"];
const CATHEDRAL = { height: 2.4, peak: 0.3, spread: 0.85, centerRise: 0.3 };

function innerDiameter(positions: ArrayLike<number>): number {
  let min = Infinity;
  for (let i = 0; i < positions.length; i += 3) min = Math.min(min, Math.hypot(positions[i]!, positions[i + 1]!));
  return min * 2;
}

describe("ring shank", () => {
  const cases = PROFILES.flatMap((profile) =>
    [
      { taper: 0, cathedral: null, width: 2, thickness: 1.6, size: 6 },
      { taper: 0.4, cathedral: CATHEDRAL, width: 2.4, thickness: 1.8, size: 9.25 },
      { taper: 0.1, cathedral: null, width: 8, thickness: 3, size: 3 },
      { taper: 0, cathedral: null, width: 1.5, thickness: 1.2, size: 13 },
    ].map((c) => [profile, c] as const),
  );

  it.each(cases)("%s %o is closed, edge-manifold and consistently wound", (profile, c) => {
    const shank = buildShank({ innerRadius: usSizeToInnerDiameterMm(c.size) / 2, width: c.width, thickness: c.thickness, profile, taper: c.taper, cathedral: c.cathedral });
    const edges = analyzeEdges(shank.geometry);
    expect(edges.openEdges).toBe(0);
    expect(edges.nonManifoldEdges).toBe(0);
    expect(edges.inconsistentEdges).toBe(0);
    expect(edges.degenerateTriangles).toBe(0);
    expect(splitIslands(shank.geometry)).toHaveLength(1);
    expect(signedVolume(shank.geometry)).toBeGreaterThan(0);
  });

  it.each(PROFILES)("%s keeps the finger hole exactly the ordered size", (profile) => {
    for (const size of [3, 6, 7.5, 13]) {
      const shank = buildShank({ innerRadius: usSizeToInnerDiameterMm(size) / 2, width: 2.2, thickness: 1.7, profile, taper: 0.25, cathedral: CATHEDRAL });
      const d = innerDiameter(shank.geometry.getAttribute("position").array);
      expect(d).toBeCloseTo(usSizeToInnerDiameterMm(size), 2);
    }
  });

  it("tapers toward the head and rises into cathedral shoulders", () => {
    const params = { innerRadius: 8.25, width: 2.4, thickness: 1.7, profile: "comfort" as const, taper: 0.4, cathedral: CATHEDRAL };
    const shank = buildShank(params);
    expect(shank.widthAt(Math.PI / 2)).toBeCloseTo(2.4 * 0.6, 6);
    expect(shank.widthAt(-Math.PI / 2)).toBeCloseTo(2.4, 6);
    const top = shankOuterRadius(params, Math.PI / 2, 0);
    const shoulder = shankOuterRadius(params, Math.PI / 2 - CATHEDRAL.peak, 0);
    const bottom = shankOuterRadius(params, -Math.PI / 2, 0);
    expect(shoulder - bottom).toBeCloseTo(CATHEDRAL.height, 1);
    expect(top - bottom).toBeCloseTo(CATHEDRAL.centerRise, 1);
  });

  it("has smooth (indexed, shared-vertex) metal normals with UVs", () => {
    const shank = buildShank({ innerRadius: 8.25, width: 2, thickness: 1.6, profile: "d-shape", taper: 0 });
    expect(shank.geometry.getIndex()).not.toBeNull();
    expect(shank.geometry.getAttribute("normal")).toBeDefined();
    expect(shank.geometry.getAttribute("uv")).toBeDefined();
  });
});
