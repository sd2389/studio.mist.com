import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  ensureFacetedGemNormals,
  ensureFacetedGemNormalsOnMesh,
} from "@/lib/gem-gpu/ensure-faceted-gem-normals";

describe("ensureFacetedGemNormals", () => {
  it("converts a smoothed indexed sphere into non-indexed faceted normals", () => {
    const geom = new THREE.SphereGeometry(1, 8, 6);
    expect(geom.index).not.toBeNull();

    const out = ensureFacetedGemNormals(geom);
    expect(out.index).toBeNull();
    const normals = out.getAttribute("normal");
    expect(normals).toBeTruthy();
    expect(normals.count).toBe(out.getAttribute("position").count);
  });

  it("is idempotent via userData flag (second call returns same geometry)", () => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const first = ensureFacetedGemNormals(geom);
    const second = ensureFacetedGemNormals(first);
    expect(second).toBe(first);
  });
});

describe("ensureFacetedGemNormalsOnMesh", () => {
  it("replaces geometry without disposing the previous one (GLTF/cache may share it)", () => {
    const shared = new THREE.SphereGeometry(1, 8, 6);
    const disposeSpy = vi.spyOn(shared, "dispose");
    const mesh = new THREE.Mesh(shared);

    ensureFacetedGemNormalsOnMesh(mesh);

    expect(mesh.geometry).not.toBe(shared);
    expect(disposeSpy).not.toHaveBeenCalled();
    disposeSpy.mockRestore();
    shared.dispose();
    mesh.geometry.dispose();
  });
});
