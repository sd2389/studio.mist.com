import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { segmentMeshesIntoSlots } from "@/lib/convert/segment-meshes";
import { principalExtents } from "@/lib/convert/segmentation/principal-extents";
import {
  classifyIslandSlots,
  classifyIslands,
  isGemShaped,
  measureGeometryIslands,
  splitIslands,
  type IslandMetrics,
} from "@/lib/mesh-segmentation";
import {
  bandGeometry,
  beadGeometry,
  buildRingFixture,
  octahedronStone,
  prongGeometry,
  singleCutStone,
  toTriangleSoup,
} from "./fixtures/jewelry-fixtures";

function metricsOf(geometry: THREE.BufferGeometry): IslandMetrics {
  const measured = measureGeometryIslands(geometry);
  expect(measured?.labels.islandCount).toBe(1);
  return measured!.metrics[0];
}

/** Eight-point star bipyramid: faceted and closed like a stone, but concave. */
function starBipyramid(): THREE.BufferGeometry {
  const points: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.35;
    points.push(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  points.push(0, 0.5, 0, 0, -0.5, 0);
  for (let i = 0; i < 16; i++) {
    const j = (i + 1) % 16;
    index.push(16, j, i, 17, i, j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(index);
  return geometry;
}

describe("island metrics", () => {
  it("reads octahedron and single-cut stones as closed, convex and fully faceted", () => {
    for (const stone of [octahedronStone(1.2), singleCutStone(6.5)]) {
      const m = metricsOf(stone);
      expect(m.isClosed).toBe(true);
      expect(m.convexity).toBeGreaterThan(0.99);
      expect(m.planarRatio).toBeGreaterThan(0.99);
      expect(m.facetCount).toBeGreaterThanOrEqual(8);
      expect(isGemShaped(m)).toBe(true);
    }
  });

  it("reads a tessellated band as smooth metal with no large facets", () => {
    const m = metricsOf(bandGeometry());
    expect(m.isClosed).toBe(true);
    expect(m.facetCount).toBe(0);
    expect(m.planarRatio).toBe(0);
    expect(isGemShaped(m)).toBe(false);
  });

  it("rejects faceted but concave solids through the convexity signal", () => {
    const m = metricsOf(starBipyramid());
    expect(m.facetCount).toBeGreaterThanOrEqual(8);
    expect(m.planarRatio).toBeGreaterThan(0.99);
    expect(m.convexity).not.toBeNull();
    expect(m.convexity!).toBeLessThan(0.9);
    expect(isGemShaped(m)).toBe(false);
  });

  it("rejects prongs (rods), beads (spheres) and prisms whose facets never tilt", () => {
    expect(metricsOf(prongGeometry()).isRod).toBe(true);
    expect(isGemShaped(metricsOf(prongGeometry()))).toBe(false);
    expect(metricsOf(beadGeometry()).sphericity).toBeGreaterThan(0.95);
    expect(isGemShaped(metricsOf(beadGeometry()))).toBe(false);
    expect(isGemShaped(metricsOf(new THREE.SphereGeometry(0.6, 10, 6)))).toBe(false);
    const stubProng = metricsOf(prongGeometry(0.35, 1.2));
    expect(stubProng.inclinedShare).toBe(0);
    expect(isGemShaped(stubProng)).toBe(false);
  });

  it("measures principal extents independent of orientation", () => {
    const box = new THREE.BoxGeometry(4, 1, 2).toNonIndexed();
    box.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.4, 1.1, -0.7)));
    const [long, mid, short] = principalExtents(box.getAttribute("position").array, box.getAttribute("position").count);
    expect(long).toBeCloseTo(4, 3);
    expect(mid).toBeCloseTo(2, 3);
    expect(short).toBeCloseTo(1, 3);
  });
});

describe("splitIslands", () => {
  it("welds an STL-style soup and splits it into one island per part", () => {
    const ring = buildRingFixture();
    const total = Object.values(ring.parts).reduce((sum, count) => sum + count, 0);
    const islands = splitIslands(ring.soup);
    expect(islands).toHaveLength(total);
    const triangles = islands.reduce((sum, g) => sum + g.getAttribute("position").count / 3, 0);
    expect(triangles).toBe(ring.soup.getAttribute("position").count / 3);
  });

  it("returns a single clone when the mesh is one connected piece", () => {
    const band = toTriangleSoup(bandGeometry());
    expect(splitIslands(band)).toHaveLength(1);
  });
});

describe("classifyIslands", () => {
  it("labels band and prongs metal, the centre stone gem and repeated small stones accents", () => {
    const ring = buildRingFixture(8, 2);
    const slots = classifyIslandSlots(ring.pieces.map((piece) => piece.geometry));
    ring.pieces.forEach((piece, i) => {
      const expected = {
        band: { role: "metal", slot: "Metal 1" },
        prong: { role: "metal", slot: "Metal 2" },
        bead: { role: "metal", slot: "Metal 2" },
        center: { role: "gem", slot: "Gem 1" },
        accent: { role: "accent-gem", slot: "Accent 1" },
      }[piece.kind];
      expect(slots[i], piece.kind).toEqual(expected);
    });
  });

  it("keeps a lone smaller stone of another cut as its own gem slot", () => {
    const side = singleCutStone(2.2, 16);
    side.translate(20, 0, 0);
    const roles = classifyIslandSlots([singleCutStone(6.5), side, octahedronStone(1), octahedronStone(1)]);
    expect(roles.map((r) => r.slot)).toEqual(["Gem 1", "Gem 2", "Accent 1", "Accent 1"]);
  });

  it("treats identical stones with no stand-out centre as main stones (eternity band)", () => {
    const stones = Array.from({ length: 12 }, () => octahedronStone(1.5));
    expect(new Set(classifyIslands(stones))).toEqual(new Set(["gem"]));
  });

  it("classifies the same whether the mesh is indexed or a triangle soup", () => {
    const ring = buildRingFixture(4, 0);
    const indexed = classifyIslands(ring.pieces.map((p) => p.geometry));
    const soup = classifyIslands(ring.pieces.map((p) => toTriangleSoup(p.geometry)));
    expect(soup).toEqual(indexed);
  });
});

describe("segmentMeshesIntoSlots", () => {
  function segmentSoup(soup: THREE.BufferGeometry): THREE.Mesh[] {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(soup);
    root.add(mesh);
    return segmentMeshesIntoSlots([mesh], root);
  }

  it("builds one mesh per slot with jewelry roles and existing slot names", () => {
    const meshes = segmentSoup(buildRingFixture(8, 2).soup);
    expect(meshes.map((m) => [m.name, m.userData.jewelryRole])).toEqual([
      ["Metal 1", "metal"],
      ["Metal 2", "metal"],
      ["Gem 1", "gem"],
      ["Accent 1", "accent-gem"],
    ]);
    expect(meshes.some((m) => m instanceof THREE.InstancedMesh)).toBe(false);
  });

  it("emits stones flat-shaded and non-indexed, one closed island per stone", () => {
    const meshes = segmentSoup(buildRingFixture(8, 0).soup);
    const accents = meshes.find((m) => m.name === "Accent 1")!;
    expect(accents.geometry.index).toBeNull();
    const normal = accents.geometry.getAttribute("normal");
    for (let t = 0; t < normal.count; t += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(normal, t);
      expect(a.dot(new THREE.Vector3().fromBufferAttribute(normal, t + 1))).toBeCloseTo(1, 5);
      expect(a.dot(new THREE.Vector3().fromBufferAttribute(normal, t + 2))).toBeCloseTo(1, 5);
    }
    const islands = measureGeometryIslands(accents.geometry)!;
    expect(islands.labels.islandCount).toBe(8);
    expect(islands.metrics.every((m) => m.isClosed && isGemShaped(m))).toBe(true);
  });

  it("gives soup metal welded, crease-aware smooth normals", () => {
    const meshes = segmentSoup(toTriangleSoup(bandGeometry()));
    expect(meshes).toHaveLength(1);
    const band = meshes[0].geometry;
    expect(band.index).not.toBeNull();
    // Welding collapses the soup's three-corners-per-triangle back to shared vertices.
    expect(band.getAttribute("position").count).toBeLessThan(band.index!.count / 3);
  });

  it("bakes node transforms so parts from different meshes are compared in one space", () => {
    const root = new THREE.Group();
    const band = new THREE.Mesh(bandGeometry());
    const stone = new THREE.Mesh(octahedronStone(1));
    stone.position.set(0, 12, 0);
    stone.scale.setScalar(4);
    root.add(band, stone);
    const meshes = segmentMeshesIntoSlots([band, stone], root);
    const gem = meshes.find((m) => m.name === "Gem 1")!;
    gem.geometry.computeBoundingBox();
    expect(gem.geometry.boundingBox!.max.y).toBeCloseTo(14, 3);
  });
});
