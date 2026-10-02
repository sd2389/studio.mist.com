import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildJewelry, exportAllSizesZip, exportGlb, exportMtl, exportObj, exportStl, getPreset, HALF_RING_SIZES, isWatertight, sizeFileName } from "@/lib/jewelry-cad";
import * as THREE from "three";

function triangleTotal(parts: ReturnType<typeof buildJewelry>["parts"], stones: boolean): number {
  return parts
    .filter((p) => stones || p.role === "metal")
    .reduce((n, p) => n + (p.geometry.getIndex()?.count ?? p.geometry.getAttribute("position").count) / 3, 0);
}

/** Read a binary STL back into a triangle soup. */
function readStl(bytes: Uint8Array): THREE.BufferGeometry {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const positions = new Float32Array(count * 9);
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 9; k++) positions[t * 9 + k] = view.getFloat32(84 + t * 50 + 12 + k * 4, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return g;
}

const built = buildJewelry(getPreset("halo").design);

describe("binary STL", () => {
  it("has an 80-byte header, a triangle count and 50 bytes per triangle", () => {
    const stl = exportStl(built.parts);
    const header = strFromU8(stl.slice(0, 80));
    expect(header.startsWith("solid")).toBe(false);
    expect(header).toContain("mm");
    const count = new DataView(stl.buffer).getUint32(80, true);
    expect(count).toBe(triangleTotal(built.parts, false));
    expect(stl.byteLength).toBe(84 + count * 50);
  });

  it("includes stones only when asked", () => {
    const metal = new DataView(exportStl(built.parts).buffer).getUint32(80, true);
    const all = new DataView(exportStl(built.parts, { includeStones: true }).buffer).getUint32(80, true);
    expect(all).toBe(triangleTotal(built.parts, true));
    expect(all).toBeGreaterThan(metal);
  });

  it("writes the shank as a watertight solid", () => {
    const band = buildJewelry(getPreset("band").design);
    expect(isWatertight(readStl(exportStl(band.parts)))).toBe(true);
  });
});

describe("OBJ", () => {
  it("writes one named object per slot with vertices, normals and faces", () => {
    const obj = exportObj(built.parts, { includeStones: true, mtlFileName: "halo.mtl" });
    const lines = obj.split("\n");
    expect(lines).toContain("mtllib halo.mtl");
    expect(lines.filter((l) => l.startsWith("o ")).map((l) => l.slice(2))).toEqual(built.parts.map((p) => p.slot));
    const vertices = lines.filter((l) => l.startsWith("v ")).length;
    expect(vertices).toBe(built.parts.reduce((n, p) => n + p.geometry.getAttribute("position").count, 0));
    expect(lines.filter((l) => l.startsWith("f ")).length).toBe(triangleTotal(built.parts, true));
    // Face indices stay inside the vertex list.
    let maxIndex = 0;
    for (const l of lines) {
      if (!l.startsWith("f ")) continue;
      for (const corner of l.slice(2).split(" ")) maxIndex = Math.max(maxIndex, Number(corner.split("/")[0]));
    }
    expect(maxIndex).toBe(vertices);
    expect(exportMtl(built.parts)).toContain("newmtl Accent_1");
  });
});

describe("GLB", () => {
  it("is a valid glTF 2.0 binary with slot-named nodes and materials", async () => {
    const glb = await exportGlb(built.parts);
    const view = new DataView(glb);
    expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);
    const jsonLength = view.getUint32(12, true);
    expect(view.getUint32(16, true)).toBe(0x4e4f534a); // "JSON"
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));
    const names = json.nodes.map((n: { name?: string }) => n.name);
    for (const part of built.parts) expect(names).toContain(part.slot);
    expect(json.materials.map((m: { name: string }) => m.name)).toEqual(built.parts.map((p) => p.slot));
    expect(json.extensionsUsed).toContain("KHR_materials_transmission");
  });

  it("can fold the head into Metal 1 and bake a display scale", async () => {
    const glb = await exportGlb(built.parts, { mergeMetal: true, scale: 0.05 });
    const view = new DataView(glb);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, view.getUint32(12, true))));
    const names: string[] = json.nodes.map((n: { name?: string }) => n.name);
    expect(names).not.toContain("Heads");
    const metal = json.nodes.find((n: { name?: string }) => n.name === "Metal 1");
    const accessor = json.accessors[json.meshes[metal.mesh].primitives[0].attributes.POSITION];
    expect(accessor.max[1]).toBeLessThan(1.5); // ~24 mm tall × 0.05
  });
});

describe("all-sizes pack", () => {
  it("zips one watertight STL per half size plus the size sheet", () => {
    const design = getPreset("band").design;
    const zip = unzipSync(exportAllSizesZip(design, { name: "mist-band" }));
    const stls = Object.keys(zip).filter((n) => n.endsWith(".stl"));
    expect(stls).toHaveLength(HALF_RING_SIZES.length);
    expect(stls).toContain(sizeFileName("mist-band", 6.5));
    for (const name of stls) {
      const bytes = zip[name]!;
      expect(bytes.byteLength).toBe(84 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true) * 50);
    }
    const csv = strFromU8(zip["sizes.csv"]!).trim().split("\n");
    expect(csv).toHaveLength(HALF_RING_SIZES.length + 1);
    expect(csv[0]).toContain("platinum_g");
    expect(zip["README.txt"]).toBeDefined();
    expect(isWatertight(readStl(zip[sizeFileName("mist-band", 3)]!))).toBe(true);
  }, 60_000);
});
