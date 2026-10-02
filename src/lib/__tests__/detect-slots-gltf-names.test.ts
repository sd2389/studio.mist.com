import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { detectSlots, inferSlotFromCandidates } from "@/lib/slot-materials/detect-slots";

/** A saved GLB loads back with GLTFLoader-sanitised names: "Metal 2" → "Metal_2". */
function sceneWith(names: string[]): THREE.Group {
  const root = new THREE.Group();
  for (const name of names) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry());
    mesh.name = THREE.PropertyBinding.sanitizeNodeName(name);
    root.add(mesh);
  }
  return root;
}

function slotsByName(map: ReturnType<typeof detectSlots>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slot, meshes] of map) for (const mesh of meshes) out[mesh.name] = slot;
  return out;
}

describe("slot detection on reloaded GLB names", () => {
  const names = ["Metal 1", "Metal 2", "Gem 1", "Gem 2", "Accent 1"];

  it("keeps numbered slots distinct when matching upload-time tokens", () => {
    const tokens = Object.fromEntries(names.map((name) => [name, [name.toLowerCase()]]));
    expect(slotsByName(detectSlots(sceneWith(names), tokens))).toEqual({
      Metal_1: "Metal 1", Metal_2: "Metal 2", Gem_1: "Gem 1", Gem_2: "Gem 2", Accent_1: "Accent 1",
    });
  });

  it("infers the same slots from names alone", () => {
    expect(slotsByName(detectSlots(sceneWith(names)))).toEqual({
      Metal_1: "Metal 1", Metal_2: "Metal 2", Gem_1: "Gem 1", Gem_2: "Gem 2", Accent_1: "Accent 1",
    });
    expect(inferSlotFromCandidates(["Accent_03"])).toBe("Accent 3");
  });

  it("reads plural CAD layer names (RhinoGold's \"Gems\") as their slot", () => {
    expect(inferSlotFromCandidates(["Gems"])).toBe("Gem 1");
    expect(inferSlotFromCandidates(["Stones"])).toBe("Gem 1");
    expect(inferSlotFromCandidates(["Bands"])).toBe("Metal 1");
  });

  it("still matches raw layer tokens that contain dots or spaces", () => {
    const root = sceneWith(["Gold.Band 01"]);
    expect(slotsByName(detectSlots(root, { "Metal 1": ["gold.band 01"] }))).toEqual({ GoldBand_01: "Metal 1" });
  });
});
