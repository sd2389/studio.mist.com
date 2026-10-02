import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { countMeshTriangles, countPolygons } from "@/lib/upload/count-polygons";
import { decimateModelRoot, isGemMesh, planMetalDecimation } from "@/lib/upload/decimate-model";
import { octahedronStone, singleCutStone, toTriangleSoup } from "./fixtures/jewelry-fixtures";

function buildModel() {
  const root = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(9, 1.1, 96, 400)); // 76 800 triangles
  band.name = "Metal 1";
  band.userData.jewelryRole = "metal";
  const center = new THREE.Mesh(toTriangleSoup(singleCutStone(6.5, 16)));
  center.name = "Gem 1";
  center.userData.jewelryRole = "gem";
  const accents = new THREE.Mesh(toTriangleSoup(octahedronStone(1.2)));
  accents.name = "Accent 1";
  accents.userData.devjewelsSlot = "Accent 1";
  root.add(band, center, accents);
  return { root, band, center, accents };
}

describe("isGemMesh", () => {
  it("recognises stones by jewelry role or by slot name", () => {
    const { band, center, accents } = buildModel();
    expect(isGemMesh(center)).toBe(true);
    expect(isGemMesh(accents)).toBe(true);
    expect(isGemMesh(band)).toBe(false);
  });
});

describe("planMetalDecimation", () => {
  it("subtracts untouched stones from the budget before sizing the metal", () => {
    const { root, center, accents } = buildModel();
    const gems = countMeshTriangles(center) + countMeshTriangles(accents);
    const plan = planMetalDecimation(root, 20_000);
    expect(plan.gemTriangles).toBe(gems);
    expect(plan.metalTriangles).toBe(76_800);
    expect(plan.metalBudget).toBe(20_000 - gems);
    expect(plan.keepRatio).toBeCloseTo((20_000 - gems) / 76_800, 6);
  });

  it("does nothing when the model already fits", () => {
    expect(planMetalDecimation(buildModel().root, 200_000).keepRatio).toBe(1);
  });

  it("keeps a floor of metal when stones alone exceed the budget", () => {
    expect(planMetalDecimation(buildModel().root, 10).keepRatio).toBe(0.05);
  });
});

describe("decimateModelRoot", () => {
  it("simplifies only metal and never touches stone geometry", async () => {
    const { root, band, center, accents } = buildModel();
    const centerGeometry = center.geometry;
    const accentGeometry = accents.geometry;
    const centerPositions = Array.from(centerGeometry.getAttribute("position").array);

    const count = await decimateModelRoot(root, 20_000);

    expect(center.geometry).toBe(centerGeometry);
    expect(accents.geometry).toBe(accentGeometry);
    expect(Array.from(center.geometry.getAttribute("position").array)).toEqual(centerPositions);
    expect(countMeshTriangles(band)).toBeLessThan(76_800);
    expect(count).toBeLessThanOrEqual(20_000);
    expect(count).toBe(countPolygons(root));
  });

  it("keeps simplified metal indexed with smooth normals", async () => {
    const { root, band } = buildModel();
    await decimateModelRoot(root, 20_000);
    expect(band.geometry.index).not.toBeNull();
    const normal = band.geometry.getAttribute("normal");
    expect(normal.count).toBe(band.geometry.getAttribute("position").count);
    // A smooth torus shares normals across triangles: far fewer vertices than corners.
    expect(normal.count).toBeLessThan(band.geometry.index!.count / 2);
  });

  it("returns the current count untouched when under budget", async () => {
    const { root, band } = buildModel();
    const geometry = band.geometry;
    expect(await decimateModelRoot(root, 500_000)).toBe(countPolygons(root));
    expect(band.geometry).toBe(geometry);
  });
});
