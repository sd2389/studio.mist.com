import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import { convertUploadToGlb, inspectModelFromFile } from "@/lib/convert/to-glb";
import { detectSlots } from "@/lib/slot-materials/detect-slots";
import { buildRingFixture } from "./fixtures/jewelry-fixtures";
import { toBinaryStl } from "./fixtures/mesh-writers";

/**
 * The stored artefact is always a GLB: a segmented upload must keep its slot names, jewelry
 * roles, flat non-indexed stones and detected units through GLTFExporter → GLTFLoader.
 */

/** GLTFExporter reads its Blob output through FileReader, which Node does not ship. */
class NodeFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
}

beforeAll(() => {
  if (typeof globalThis.FileReader === "undefined") {
    (globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;
  }
});

async function roundTrip(file: File): Promise<{ scene: THREE.Object3D; slotTokens: Record<string, string[]> }> {
  const inspected = await inspectModelFromFile(file);
  const converted = await convertUploadToGlb(file, {
    preloaded: inspected.loaded,
    generateThumbnail: false,
    compress: false,
  });
  expect(converted.glbFilename).toBe("ring.glb");
  const gltf = await new GLTFLoader().parseAsync(await converted.glb.arrayBuffer(), "");
  return { scene: gltf.scene, slotTokens: converted.slotTokens };
}

describe("segmented upload → GLB round trip", () => {
  it("keeps slots, roles, flat stones and units in the stored GLB", async () => {
    const { scene, slotTokens } = await roundTrip(new File([toBinaryStl(buildRingFixture().soup)], "ring.stl"));
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    // What the studio does with a saved scene: detect slots from the persisted tokens.
    const slotOf = new Map<THREE.Mesh, string>();
    for (const [slot, slotMeshes] of detectSlots(scene, slotTokens)) for (const mesh of slotMeshes) slotOf.set(mesh, slot);
    expect(meshes.map((m) => [slotOf.get(m), m.userData.jewelryRole, m.userData.devjewelsSlot]).sort()).toEqual([
      ["Accent 1", "accent-gem", "Accent 1"],
      ["Gem 1", "gem", "Gem 1"],
      ["Metal 1", "metal", "Metal 1"],
      ["Metal 2", "metal", "Metal 2"],
    ]);
    for (const mesh of meshes) {
      expect(mesh instanceof THREE.InstancedMesh).toBe(false);
      if (mesh.userData.jewelryRole !== "metal") expect(mesh.geometry.index, mesh.name).toBeNull();
    }
    let units: { mmPerUnit?: number; sizeMm?: number[] } | undefined;
    scene.traverse((object) => {
      units ??= object.userData.devjewelsUnits;
    });
    expect(units?.mmPerUnit).toBe(1);
    expect(units?.sizeMm?.[0]).toBeCloseTo(20.2, 1);
  });
});
