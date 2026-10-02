import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { analyzeEdges, buildJewelry, CAD_CUTS, convexityError, getPreset, signedVolume, splitIslands, stoneSizeForCarat } from "@/lib/jewelry-cad";
import { buildMeleeModel, buildStoneModel } from "@/lib/jewelry-cad/stones/stone-model";
import { buildGemTraceTable } from "@/lib/gem-gpu/gem-trace-geometry";

/** Distinct facet planes at the gem tracer's tightest merge tolerance (0.5°). */
function facetPlaneCount(g: THREE.BufferGeometry): number {
  const p = g.getAttribute("position");
  const normals: THREE.Vector3[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.length() < 1e-12) continue;
    n.normalize();
    if (!normals.some((m) => m.dot(n) > Math.cos((0.5 * Math.PI) / 180))) normals.push(n);
  }
  return normals.length;
}

function expectFlatShaded(g: THREE.BufferGeometry): void {
  expect(g.getIndex()).toBeNull();
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (let k = 0; k < 3; k++) {
      const vn = new THREE.Vector3().fromBufferAttribute(n, i + k);
      expect(vn.dot(face)).toBeGreaterThan(0.999);
    }
  }
}

/** Cuts made of two convex halves, concave only along the cleft between them. */
const TWO_PIECE = new Set(["heart"]);

/** Each traced piece of a stone as its own (open) geometry. */
function tracedPieces(g: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const { stones, stoneOfVertex } = buildGemTraceTable(g);
  const p = g.getAttribute("position");
  return stones.map((_, i) => {
    const kept: number[] = [];
    for (let v = 0; v < p.count; v++) if (stoneOfVertex[v] === i) kept.push(p.getX(v), p.getY(v), p.getZ(v));
    return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  });
}

function expectSoundStone(g: THREE.BufferGeometry, size: number, twoPiece = false): void {
  const edges = analyzeEdges(g);
  expect(edges.openEdges).toBe(0);
  expect(edges.nonManifoldEdges).toBe(0);
  expect(edges.inconsistentEdges).toBe(0);
  expect(signedVolume(g)).toBeGreaterThan(0);
  if (!twoPiece) {
    expect(convexityError(g)).toBeLessThan(size * 2e-4);
    return;
  }
  // The tracer finds the cleft from the mesh alone, and each half it traces is convex.
  expect(convexityError(g)).toBeGreaterThan(size * 1e-2);
  const pieces = tracedPieces(g);
  expect(pieces).toHaveLength(2);
  for (const piece of pieces) expect(convexityError(piece)).toBeLessThan(size * 2e-4);
}

/** Total depth as a fraction of width; a rose is flat-backed and a briolette round in section. */
const DEPTH_RANGE: Partial<Record<string, readonly [number, number]>> = { rose: [0.3, 0.55], briolette: [0.85, 1.0] };

describe("generated stones", () => {
  const cases = CAD_CUTS.flatMap((cut) => [0.25, 1, 3].map((carat) => [cut.id, carat] as const));

  it.each(cases)("%s %s ct is a closed, convex, outward, flat-shaded solid", (cut, carat) => {
    const model = buildStoneModel(cut, carat, 3.52);
    const size = Math.max(model.length, model.width);
    expectSoundStone(model.geometry, size, TWO_PIECE.has(cut));
    expectFlatShaded(model.geometry);
    expect(facetPlaneCount(model.geometry)).toBeLessThanOrEqual(127);
  });

  it.each(CAD_CUTS.map((c) => c.id))("%s is cut to the carat chart's face-up size", (cut) => {
    const model = buildStoneModel(cut, 1, 3.52);
    const target = stoneSizeForCarat(cut, 1);
    expect(model.length).toBeCloseTo(target.length, 1);
    expect(model.width).toBeCloseTo(target.width, 1);
    // Table up, girdle mid-plane at y = 0, plausible depth for the cut's family.
    expect(model.tableY).toBeGreaterThan(0);
    expect(model.culetY).toBeLessThan(0);
    const depth = (model.tableY - model.culetY) / model.width;
    const [minDepth, maxDepth] = DEPTH_RANGE[cut] ?? [0.55, 0.78];
    expect(depth).toBeGreaterThan(minDepth);
    expect(depth).toBeLessThan(maxDepth);
  });

  it("melee are sound too", () => {
    const melee = buildMeleeModel(1.3);
    expectSoundStone(melee.geometry, 1.3);
    expectFlatShaded(melee.geometry);
    expect(melee.carat).toBeCloseTo(0.01, 3);
  });

  it.each(["halo", "pave", "eternity", "pendant", "three-stone", "studs"] as const)(
    "%s: every stone in a merged slot is its own convex, closed island",
    (presetId) => {
      const built = buildJewelry(getPreset(presetId).design);
      const stoneParts = built.parts.filter((p) => p.role !== "metal");
      expect(stoneParts.length).toBeGreaterThan(0);
      let stones = 0;
      for (const part of stoneParts) {
        const islands = splitIslands(part.geometry);
        const spec = built.specs.stones.filter((s) => s.slot === part.slot).reduce((n, s) => n + s.count, 0);
        expect(islands).toHaveLength(spec);
        for (const island of islands) {
          island.computeBoundingBox();
          const size = island.boundingBox!.getSize(new THREE.Vector3()).length();
          expectSoundStone(island, size);
        }
        stones += islands.length;
      }
      expect(stones).toBe(built.specs.stoneCount);
    },
  );
});
