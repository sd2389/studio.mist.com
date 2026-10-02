import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildGemTraceTable, MAX_GEM_PLANES, type GemStonePlanes } from "@/lib/gem-gpu/gem-trace-geometry";
import { GEM_STONE_ROW_ATTRIBUTE, registerGemTraceGeometry } from "@/lib/gem-gpu/gem-trace-atlas";
import { GEM_CONFIGS } from "@/lib/gem-gpu/gem-configs";
import { gemTraceParamsFromConfig } from "@/lib/gem-gpu/gem-trace-material";
import { buildSplitSolid, type SplitPiece } from "@/lib/stones/split-solid";

function everyVertexInside(geometry: THREE.BufferGeometry, stone: GemStonePlanes): boolean {
  const position = geometry.getAttribute("position");
  for (let v = 0; v < position.count; v++) {
    for (let p = 0; p < stone.planeCount; p++) {
      const [nx, ny, nz, d] = stone.planes.subarray(p * 4, p * 4 + 4);
      if (nx! * position.getX(v) + ny! * position.getY(v) + nz! * position.getZ(v) > d! + 1e-5) return false;
    }
  }
  return true;
}

describe("buildGemTraceTable", () => {
  it("traces a stone with a cleft as two linked convex pieces, wherever it is placed", () => {
    // A bipyramid over a notched (heart-like) outline: concave only along its cleft.
    const half = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.2, 0, 1), new THREE.Vector3(-1, 0, 0.8), new THREE.Vector3(-0.8, 0, 0)];
    const apexes = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
    const pieceOf = (mirror: number): SplitPiece => {
      const pts = half.map((p) => new THREE.Vector3(p.x, p.y, p.z * mirror));
      const inside = new THREE.Vector3(0, 0, 0.3 * mirror);
      const planes = [{ normal: new THREE.Vector3(0, 0, -mirror), offset: 0 }];
      for (let i = 0; i < 3; i++) {
        for (const apex of apexes) {
          const plane = new THREE.Plane().setFromCoplanarPoints(apex, pts[i]!, pts[i + 1]!);
          if (plane.distanceToPoint(inside) > 0) plane.negate();
          planes.push({ normal: plane.normal.clone(), offset: -plane.constant });
        }
      }
      return { planes, inside };
    };
    const heart = buildSplitSolid([pieceOf(1), pieceOf(-1)], { normal: new THREE.Vector3(0, 0, 1), d: 0 }, 2);
    // Placed in a ring and merged with a melee stone: the split must be found from the mesh.
    heart.applyMatrix4(new THREE.Matrix4().makeRotationY(0.7).setPosition(3, 1, -2));
    const melee = new THREE.OctahedronGeometry(0.3).toNonIndexed().deleteAttribute("uv");
    const geometry = mergeGeometries([melee, heart])!;

    const { stones, stoneOfVertex } = buildGemTraceTable(geometry);
    expect(stones).toHaveLength(3);
    expect(stones[0]!.partner).toBeUndefined();
    expect(stones[1]!.partner).toBe(2);
    expect(stones[2]!.partner).toBe(1);
    // Six outer faces per piece, plus the split plane, last.
    for (const stone of stones.slice(1)) {
      expect(stone.planeCount).toBe(7);
      expect(stone.splitPlane).toBe(7);
    }
    // Every vertex is inside its own piece, and each piece's split plane faces its partner.
    const position = geometry.getAttribute("position");
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      const stone = stones[stoneOfVertex[i]!]!;
      v.fromBufferAttribute(position, i);
      for (let p = 0; p < stone.planeCount; p++) {
        const [nx, ny, nz, d] = stone.planes.subarray(p * 4, p * 4 + 4);
        expect(nx! * v.x + ny! * v.y + nz! * v.z).toBeLessThanOrEqual(d! + 1e-5);
      }
    }
    const splitOf = (stone: GemStonePlanes) => stone.planes.subarray((stone.splitPlane! - 1) * 4, stone.splitPlane! * 4);
    const [a, b] = [splitOf(stones[1]!), splitOf(stones[2]!)];
    for (let k = 0; k < 4; k++) expect(a[k]!).toBeCloseTo(-b[k]!, 5);
    expect(stones[1]!.radius).toBeCloseTo(stones[2]!.radius, 6);
  });

  it("recovers one plane per facet of a convex solid", () => {
    const cases: [THREE.BufferGeometry, number][] = [
      [new THREE.OctahedronGeometry(1), 8],
      [new THREE.IcosahedronGeometry(1), 20],
      [new THREE.DodecahedronGeometry(1), 12],
    ];
    for (const [geometry, facets] of cases) {
      const { stones } = buildGemTraceTable(geometry);
      expect(stones).toHaveLength(1);
      expect(stones[0]!.planeCount).toBe(facets);
      expect(everyVertexInside(geometry, stones[0]!)).toBe(true);
      expect(stones[0]!.radius).toBeCloseTo(1, 5);
    }
  });

  it("splits merged stones into islands with their own planes", () => {
    const a = new THREE.OctahedronGeometry(0.5);
    const b = new THREE.OctahedronGeometry(0.5).translate(3, 0, 0);
    const merged = mergeGeometries([a, b])!;
    const { stones, stoneOfVertex } = buildGemTraceTable(merged);
    expect(stones).toHaveLength(2);
    expect(stones.every((s) => s.planeCount === 8)).toBe(true);
    const firstHalf = stoneOfVertex.subarray(0, a.getAttribute("position").count);
    expect(new Set(firstHalf).size).toBe(1);
    expect(stoneOfVertex[stoneOfVertex.length - 1]).not.toBe(firstHalf[0]);
  });

  it("caps smooth stones to the atlas row while still enclosing them", () => {
    const sphere = new THREE.SphereGeometry(1, 64, 32);
    const { stones } = buildGemTraceTable(sphere);
    expect(stones[0]!.planeCount).toBeGreaterThan(20);
    expect(stones[0]!.planeCount).toBeLessThanOrEqual(MAX_GEM_PLANES);
    expect(everyVertexInside(sphere, stones[0]!)).toBe(true);
  });

  it("leaves a stone that cannot close untraced", () => {
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    expect(buildGemTraceTable(triangle).stones[0]!.planeCount).toBe(0);
  });
});

describe("registerGemTraceGeometry", () => {
  it("tags vertices with atlas rows once, and clones keep them", () => {
    const geometry = new THREE.IcosahedronGeometry(1);
    registerGemTraceGeometry(geometry);
    const rows = geometry.getAttribute(GEM_STONE_ROW_ATTRIBUTE);
    // Row 0 is the reserved empty stone.
    expect(rows.getX(0)).toBeGreaterThanOrEqual(1);
    registerGemTraceGeometry(geometry);
    expect(geometry.getAttribute(GEM_STONE_ROW_ATTRIBUTE)).toBe(rows);
    const clone = geometry.clone();
    registerGemTraceGeometry(clone);
    expect(clone.getAttribute(GEM_STONE_ROW_ATTRIBUTE).getX(0)).toBe(rows.getX(0));
  });
});

describe("gemTraceParamsFromConfig", () => {
  it("spreads the index of refraction red < green < blue", () => {
    const { ior } = gemTraceParamsFromConfig(GEM_CONFIGS.diamond, 6);
    expect(ior[0]).toBeLessThan(ior[1]);
    expect(ior[1]).toBeLessThan(ior[2]);
    expect(ior[1]).toBe(GEM_CONFIGS.diamond.ior);
  });

  it("absorbs nothing in a colourless diamond and mostly green/blue in a ruby", () => {
    expect(gemTraceParamsFromConfig(GEM_CONFIGS.diamond, 6).absorption).toEqual([0, 0, 0]);
    const [r, g, b] = gemTraceParamsFromConfig(GEM_CONFIGS.ruby, 6).absorption;
    expect(r).toBeLessThan(g);
    expect(r).toBeLessThan(b);
  });
});

describe("withGemTraceBounces", () => {
  it("raises shared materials once and restores them afterwards", async () => {
    const { createGemMaterial } = await import("@/lib/gem-gpu/gem-physical-material");
    const { getGemTraceUniforms, withGemTraceBounces, GEM_TRACE_BOUNCES } = await import("@/lib/gem-gpu/gem-trace-material");
    const gem = createGemMaterial("diamond", { qualityReduce: true });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.OctahedronGeometry(), gem), new THREE.Mesh(new THREE.IcosahedronGeometry(), gem));
    const seen = withGemTraceBounces(root, GEM_TRACE_BOUNCES.photometric, () => getGemTraceUniforms(gem)!.bounces.value);
    expect(seen).toBe(GEM_TRACE_BOUNCES.photometric);
    expect(getGemTraceUniforms(gem)!.bounces.value).toBe(GEM_TRACE_BOUNCES.performance);
  });
});

describe("gem trace atlas lifetime", () => {
  it("frees a stone's rows when its last user is disposed, and reuses them", async () => {
    const { gemTraceRowsInUse, hasGemTraceRows } = await import("@/lib/gem-gpu/gem-trace-atlas");
    const before = gemTraceRowsInUse();
    const original = new THREE.OctahedronGeometry(1);
    registerGemTraceGeometry(original);
    const clone = original.clone();
    registerGemTraceGeometry(clone);
    expect(gemTraceRowsInUse()).toBe(before + 1);

    original.dispose();
    expect(hasGemTraceRows(clone)).toBe(true);
    clone.dispose();
    expect(gemTraceRowsInUse()).toBe(before);

    const next = new THREE.DodecahedronGeometry(1);
    registerGemTraceGeometry(next);
    expect(next.getAttribute(GEM_STONE_ROW_ATTRIBUTE).getX(0)).toBe(original.getAttribute(GEM_STONE_ROW_ATTRIBUTE).getX(0));
    // The stale geometry no longer owns those rows and would re-register on its next use.
    expect(hasGemTraceRows(original)).toBe(false);
  });
});
