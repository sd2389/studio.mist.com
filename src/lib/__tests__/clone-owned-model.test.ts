import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { cloneOwnedModel } from "../convert/clone-owned-model";
import { simplifyMaterialsForExport } from "../convert/simplify-for-export";

describe("CAD export ownership", () => {
  it("keeps the editable model alive when an export is simplified and disposed", () => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshPhysicalMaterial({ transmission: 1, ior: 2.42 });
    const source = new THREE.Mesh(geometry, material);
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    geometry.addEventListener("dispose", geometryDisposed);
    material.addEventListener("dispose", materialDisposed);
    const exported = cloneOwnedModel(source) as THREE.Mesh;
    simplifyMaterialsForExport(exported);
    exported.geometry.dispose();
    expect(geometryDisposed).not.toHaveBeenCalled();
    expect(materialDisposed).not.toHaveBeenCalled();
    expect(source.material).toBe(material);
    expect(material.ior).toBe(2.42);
    expect(exported.geometry).not.toBe(geometry);
  });
});
