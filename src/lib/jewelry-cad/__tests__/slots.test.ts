import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { buildJewelry, exportGlb, getJewelryRole, JEWELRY_PRESETS, partsToGroup } from "@/lib/jewelry-cad";
import { detectSlots, inferSlotFromCandidates } from "@/lib/slot-materials/detect-slots";

const SLOTS = new Set(["Metal 1", "Heads", "Gem 1", "Accent 1", "Accent 2", "Accent 3"]);

function parseGlb(buffer: ArrayBuffer): Promise<GLTF> {
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, "", resolve, reject));
}

describe("slot naming", () => {
  it.each(JEWELRY_PRESETS.map((p) => [p.id, p] as const))("%s: meshes are named and tagged for the studio", (_id, preset) => {
    const built = buildJewelry(preset.design);
    const group = partsToGroup(built.parts);
    const meshes = group.children as THREE.Mesh[];
    expect(meshes.length).toBe(built.parts.length);
    for (const mesh of meshes) {
      expect(SLOTS.has(mesh.name)).toBe(true);
      expect(inferSlotFromCandidates([mesh.name])).toBe(mesh.name);
      const role = getJewelryRole(mesh);
      if (mesh.name === "Metal 1" || mesh.name === "Heads") expect(role).toBe("metal");
      else if (mesh.name === "Gem 1") expect(["gem", "accent-gem"]).toContain(role);
      else expect(role).toBe("accent-gem");
    }
    // One mesh per slot, metal before stones.
    expect(new Set(meshes.map((m) => m.name)).size).toBe(meshes.length);
    expect(meshes[0]!.name).toBe("Metal 1");
  });

  it("survives a GLB round trip into the studio's slot detection", async () => {
    const built = buildJewelry({ ...JEWELRY_PRESETS.find((p) => p.id === "halo")!.design, bandStones: "pave" });
    const gltf = await parseGlb(await exportGlb(built.parts));
    const slots = detectSlots(gltf.scene);
    expect([...slots.keys()].sort()).toEqual(["Accent 1", "Accent 2", "Gem 1", "Heads", "Metal 1"]);
    for (const [slot, meshes] of slots) {
      expect(meshes).toHaveLength(1);
      expect(meshes[0]!.userData.jewelryRole).toBe(slot.startsWith("Accent") ? "accent-gem" : slot === "Gem 1" ? "gem" : "metal");
    }
  });
});
