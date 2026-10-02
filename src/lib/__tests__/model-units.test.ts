import * as THREE from "three";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { loadModelFromFile } from "@/lib/convert/load-model";
import { readThreeMfUnit } from "@/lib/convert/loaders/three-mf";
import {
  mmPerFbxUnit,
  mmPerRhinoUnit,
  mmPerThreeMfUnit,
  normalizeModelUnits,
  resolveMmPerUnit,
} from "@/lib/convert/model-units";
import { buildRingFixture } from "./fixtures/jewelry-fixtures";
import { toBinaryStl } from "./fixtures/mesh-writers";

describe("resolveMmPerUnit", () => {
  it("keeps plausible millimetre models as they are", () => {
    expect(resolveMmPerUnit(21)).toEqual({ mmPerUnit: 1, source: "assumed" });
    expect(resolveMmPerUnit(450)).toEqual({ mmPerUnit: 1, source: "assumed" });
  });

  it("detects a ring exported in metres, inches or microns", () => {
    expect(resolveMmPerUnit(0.021)).toEqual({ mmPerUnit: 1000, source: "detected" });
    expect(resolveMmPerUnit(0.83)).toEqual({ mmPerUnit: 25.4, source: "detected" });
    expect(resolveMmPerUnit(21_000)).toEqual({ mmPerUnit: 0.001, source: "detected" });
  });

  it("trusts a declared unit only when it gives a plausible piece", () => {
    expect(resolveMmPerUnit(0.021, 1000)).toEqual({ mmPerUnit: 1000, source: "declared" });
    expect(resolveMmPerUnit(0.83, 25.4)).toEqual({ mmPerUnit: 25.4, source: "declared" });
    // A glTF that stores millimetres in "metres" would be a 21 m ring: fall back to mm.
    expect(resolveMmPerUnit(21, 1000)).toEqual({ mmPerUnit: 1, source: "assumed" });
  });

  it("does not guess on degenerate input", () => {
    expect(resolveMmPerUnit(0)).toEqual({ mmPerUnit: 1, source: "assumed" });
    expect(resolveMmPerUnit(Number.NaN)).toEqual({ mmPerUnit: 1, source: "assumed" });
  });
});

describe("declared unit tables", () => {
  it("maps Rhino, 3MF and FBX unit declarations to millimetres", () => {
    expect(mmPerRhinoUnit({ value: 4 })).toBe(1000);
    expect(mmPerRhinoUnit(2)).toBe(1);
    expect(mmPerRhinoUnit({ value: 0 })).toBeNull();
    expect(mmPerThreeMfUnit("inch")).toBe(25.4);
    expect(mmPerThreeMfUnit(null)).toBe(1);
    expect(mmPerFbxUnit(1)).toBe(10);
    expect(mmPerFbxUnit(undefined)).toBeNull();
  });

  it("reads the unit attribute from a 3MF package without inflating the mesh", () => {
    const model = `<?xml version="1.0"?><model unit="inch" xml:lang="en-US"><resources>${"<object/>".repeat(5000)}</resources></model>`;
    const zip = zipSync({ "3D/3dmodel.model": strToU8(model), "[Content_Types].xml": strToU8("<Types/>") });
    expect(readThreeMfUnit(zip)).toBe("inch");
    const noUnit = zipSync({ "3D/3dmodel.model": strToU8("<model><resources></resources></model>") });
    expect(readThreeMfUnit(noUnit)).toBeNull();
  });
});

describe("normalizeModelUnits", () => {
  it("scales the model to millimetres and records the decision for the GLB", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.006)));
    const units = normalizeModelUnits(root, null);
    expect(units.mmPerUnit).toBe(1000);
    expect(units.sizeMm[0]).toBeCloseTo(20, 5);
    expect(root.scale.x).toBeCloseTo(1000, 5);
    expect(root.userData.devjewelsUnits).toEqual(units);
  });

  it("normalises an STL ring exported in metres end to end", async () => {
    const soup = buildRingFixture(4, 0).soup.clone().scale(0.001, 0.001, 0.001);
    const file = new File([toBinaryStl(soup)], "ring-in-metres.stl");
    const loaded = await loadModelFromFile(file);
    expect(loaded.units?.source).toBe("detected");
    expect(loaded.units?.mmPerUnit).toBe(1000);
    expect(loaded.units?.sizeMm[0]).toBeCloseTo(20.2, 1); // band outer diameter
    // Segmentation is scale-free: the metre-scale ring still finds its stones.
    expect(Object.keys(loaded.slotTokens).sort()).toEqual(["Accent 1", "Gem 1", "Metal 1", "Metal 2"]);
  });
});
