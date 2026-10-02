import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { loadModelFromFile } from "@/lib/convert/load-model";
import { stripMissingTextures } from "@/lib/convert/loaders/obj";
import { plyFaceCount } from "@/lib/convert/loaders/ply";
import { buildRingFixture, octahedronStone } from "./fixtures/jewelry-fixtures";
import { toAsciiPly, toBinaryStl, toObjText } from "./fixtures/mesh-writers";

/** Real parsers (three's STL / OBJ / MTL / PLY loaders) through the shared jewelry pipeline. */

function meshSummary(root: THREE.Object3D): string[] {
  const out: string[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) out.push(`${object.name}:${object.userData.jewelryRole}`);
  });
  return out;
}

const RING_SLOTS = ["Metal 1:metal", "Metal 2:metal", "Gem 1:gem", "Accent 1:accent-gem"];

function invalidNormalCount(root: THREE.Object3D): number {
  let invalid = 0;
  const n = new THREE.Vector3();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const normal = object.geometry.getAttribute("normal");
    for (let i = 0; i < normal.count; i++) {
      if (Math.abs(n.fromBufferAttribute(normal, i).length() - 1) > 1e-3) invalid += 1;
    }
  });
  return invalid;
}

describe("mesh-soup formats", () => {
  it("STL: one merged soup comes back as metal, centre gem and accents", async () => {
    const file = new File([toBinaryStl(buildRingFixture().soup)], "solitaire.stl");
    const loaded = await loadModelFromFile(file);
    expect(meshSummary(loaded.root)).toEqual(RING_SLOTS);
    expect(Object.keys(loaded.slotTokens).sort()).toEqual(["Accent 1", "Gem 1", "Metal 1", "Metal 2"]);
  });

  it("STL: all-zero facet normals (common in CAD exports) are rebuilt, never kept", async () => {
    const loaded = await loadModelFromFile(new File([toBinaryStl(buildRingFixture().soup)], "zero-normals.stl"));
    expect(invalidNormalCount(loaded.root)).toBe(0);
  });

  it("OBJ: unnamed objects without normals are classified by shape", async () => {
    const pieces = buildRingFixture().pieces.map((piece) => ({ geometry: piece.geometry }));
    const loaded = await loadModelFromFile(new File([toObjText(pieces)], "ring.obj"));
    expect(meshSummary(loaded.root)).toEqual(RING_SLOTS);
    loaded.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name.startsWith("Metal")) {
        expect(object.geometry.getAttribute("normal")).toBeDefined();
      }
    });
  });

  it("OBJ + MTL: a material named like a stone vouches for an open, untestable stone", async () => {
    const band = buildRingFixture(0, 0).pieces[0].geometry;
    // An octahedron with one face missing is open, so the shape test alone cannot call it a stone.
    const open = octahedronStone(2).toNonIndexed();
    open.translate(0, 13, 0);
    open.setDrawRange(0, 21);
    const openStone = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.BufferAttribute(open.getAttribute("position").array.slice(0, 21 * 3), 3),
    );
    const obj = toObjText([{ geometry: band, material: "Yellow" }, { geometry: openStone, material: "Diamond" }], "ring.mtl");
    const mtl = new File(["newmtl Yellow\nKd 1 0.8 0.2\nmap_Kd missing.png\nnewmtl Diamond\nKd 1 1 1\n"], "ring.mtl");
    const loaded = await loadModelFromFile(new File([obj], "ring.obj"), { companions: [mtl] });
    expect(meshSummary(loaded.root)).toEqual(["Metal 1:metal", "Gem 1:gem"]);
  });

  it("PLY: ascii triangle mesh is segmented like STL", async () => {
    const loaded = await loadModelFromFile(new File([toAsciiPly(buildRingFixture().soup)], "ring.ply"));
    expect(meshSummary(loaded.root)).toEqual(RING_SLOTS);
  });

  it("PLY: point clouds are refused with a clear message", async () => {
    const cloud = "ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n";
    expect(plyFaceCount(new TextEncoder().encode(cloud).buffer as ArrayBuffer)).toBe(0);
    await expect(loadModelFromFile(new File([cloud], "scan.ply"))).rejects.toThrow("point cloud");
  });
});

describe("stripMissingTextures", () => {
  it("drops texture statements whose files were not provided", () => {
    const png = new File([""], "gold.png");
    const find = (reference: string) => (reference.toLowerCase().endsWith("gold.png") ? png : null);
    const mtl = "newmtl Gold\nmap_Kd textures/gold.png\nbump -bm 0.3 normal.png\nKd 1 1 1";
    expect(stripMissingTextures(mtl, find)).toBe("newmtl Gold\nmap_Kd textures/gold.png\nKd 1 1 1");
  });
});
