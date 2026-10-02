import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormatLoader, ParsedModel } from "@/lib/convert/types";

/**
 * Every extension routes to its loader chunk. Loaders are mocked here so browser-only
 * parsers (3MF needs DOMParser, STEP needs the WASM kernel) can be dispatched in Node.
 */

function stubModel(slotSource: ParsedModel["slotSource"]): ParsedModel {
  const root = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(1));
  stone.name = "Gem 1";
  root.add(stone);
  return { root, declaredMmPerUnit: 1, slotSource };
}

const loaders = vi.hoisted(() => {
  const make = () => vi.fn<FormatLoader>();
  return {
    gltf: make(), rhino: make(), step: make(), iges: make(), obj: make(),
    fbx: make(), stl: make(), ply: make(), threeMf: make(),
  };
});

vi.mock("@/lib/convert/loaders/gltf", () => ({ loadGltf: loaders.gltf }));
vi.mock("@/lib/convert/loaders/rhino", () => ({ loadRhino: loaders.rhino }));
vi.mock("@/lib/convert/loaders/occt", () => ({ loadStep: loaders.step, loadIges: loaders.iges }));
vi.mock("@/lib/convert/loaders/obj", () => ({ loadObj: loaders.obj }));
vi.mock("@/lib/convert/loaders/fbx", () => ({ loadFbx: loaders.fbx }));
vi.mock("@/lib/convert/loaders/stl", () => ({ loadStl: loaders.stl }));
vi.mock("@/lib/convert/loaders/ply", () => ({ loadPly: loaders.ply }));
vi.mock("@/lib/convert/loaders/three-mf", () => ({ loadThreeMf: loaders.threeMf }));

const { loadModelFromFile } = await import("@/lib/convert/load-model");

const CASES: [string, keyof typeof loaders][] = [
  ["ring.glb", "gltf"],
  ["ring.gltf", "gltf"],
  ["ring.3dm", "rhino"],
  ["ring.step", "step"],
  ["RING.STP", "step"],
  ["ring.iges", "iges"],
  ["ring.igs", "iges"],
  ["ring.obj", "obj"],
  ["ring.fbx", "fbx"],
  ["ring.stl", "stl"],
  ["ring.ply", "ply"],
  ["ring.3mf", "threeMf"],
];

describe("loadModelFromFile dispatch", () => {
  beforeEach(() => {
    for (const loader of Object.values(loaders)) {
      loader.mockReset();
      loader.mockImplementation(async () => stubModel("names"));
    }
  });

  it.each(CASES)("routes %s to the %s loader", async (filename, expected) => {
    await loadModelFromFile(new File(["x"], filename));
    for (const [name, loader] of Object.entries(loaders)) {
      expect(loader, name).toHaveBeenCalledTimes(name === expected ? 1 : 0);
    }
  });

  it("hands companions (MTL, textures) to the loader by basename", async () => {
    const mtl = new File(["newmtl Gold"], "ring.mtl");
    await loadModelFromFile(new File(["x"], "ring.obj"), { companions: [mtl] });
    const context = loaders.obj.mock.calls[0][1];
    expect(context.companions.find("./textures/../ring.mtl")).toBe(mtl);
    expect(context.companions.find("RING.MTL")).toBe(mtl);
    expect(context.companions.find("missing.png")).toBeNull();
  });

  it("rejects formats it cannot parse", async () => {
    await expect(loadModelFromFile(new File(["x"], "ring.dwg"))).rejects.toThrow("Unsupported model format: .dwg");
    await expect(loadModelFromFile(new File(["x"], "README"))).rejects.toThrow("Unsupported model format: .unknown");
  });

  it("regroups shape-sourced models into slots and records their units", async () => {
    loaders.stl.mockImplementation(async () => stubModel("shape"));
    const loaded = await loadModelFromFile(new File(["x"], "ring.stl"));
    expect(loaded.units?.source).toBe("declared");
    const names: string[] = [];
    loaded.root.traverse((object) => {
      if (object instanceof THREE.Mesh) names.push(`${object.name}:${object.userData.jewelryRole}`);
    });
    expect(names).toEqual(["Gem 1:gem"]);
  });

  it("fails clearly when a file has no meshes", async () => {
    loaders.gltf.mockImplementation(async () => ({ root: new THREE.Group(), declaredMmPerUnit: 1000, slotSource: "names" }));
    await expect(loadModelFromFile(new File(["x"], "empty.glb"))).rejects.toThrow("No meshes found");
  });
});
