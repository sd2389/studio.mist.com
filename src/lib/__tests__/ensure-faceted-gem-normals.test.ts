import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ensureFacetedGemNormals } from "@/lib/gem-gpu/ensure-faceted-gem-normals";

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
