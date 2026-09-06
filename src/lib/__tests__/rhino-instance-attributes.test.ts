import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { restoreRhinoInstanceAttributes } from "../rhino-loader-patch";

describe("Rhino gemstone blocks", () => {
  it("preserves each placement's layer instead of flattening every stone to the definition layer", () => {
    const root = new Object3D();
    const metal = new Object3D();
    const stoneA = new Object3D();
    const stoneB = new Object3D();
    root.add(metal, stoneA, stoneB);
    restoreRhinoInstanceAttributes(root, { objects: [
      { objectType: "InstanceDefinition", attributes: { id: "stone" } },
      { objectType: "InstanceReference", geometry: { parentIdefId: "stone" }, attributes: { layerIndex: 11 } },
      { objectType: "InstanceReference", geometry: { parentIdefId: "stone" }, attributes: { layerIndex: 12 } },
    ] });
    expect(metal.userData.rhinoInstanceAttributes).toBeUndefined();
    expect(stoneA.userData.rhinoInstanceAttributes.layerIndex).toBe(11);
    expect(stoneB.userData.rhinoInstanceAttributes.layerIndex).toBe(12);
  });
});
