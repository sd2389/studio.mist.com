import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMetalSkin, collectMetalSkinTargets, isGemLikeMaterial } from "./metal-skin";
import { createStageControl, prepareCutoutScene } from "../../lib/stage-visibility";
import { sampleModelPoints } from "./scene-points";

function mesh(name: string, material: THREE.Material | THREE.Material[]): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  m.name = name;
  return m;
}

function buildScene() {
  const scene = new THREE.Scene();
  const band = mesh("Metal 1", new THREE.MeshPhysicalMaterial({ metalness: 1 }));
  const prongs = mesh("Heads", new THREE.MeshStandardMaterial({ metalness: 0.2 }));
  const tracedGem = new THREE.MeshPhysicalMaterial({ metalness: 0 });
  tracedGem.userData.gemGpuDiamond = "diamond";
  const stone = mesh("Gem 1", tracedGem);
  const glass = mesh("Center", new THREE.MeshPhysicalMaterial({ transmission: 1 }));
  const enamel = mesh("Enamel", new THREE.MeshStandardMaterial({ metalness: 0 }));
  const unnamedMetal = mesh("Part_07", new THREE.MeshStandardMaterial({ metalness: 1 }));
  const shadow = mesh("", new THREE.ShadowMaterial());
  shadow.scale.set(12, 0.01, 12);
  scene.add(band, prongs, stone, glass, enamel, unnamedMetal, shadow);
  return { scene, band, prongs, stone, glass, enamel, unnamedMetal, shadow };
}

describe("collectMetalSkinTargets", () => {
  it("re-skins metal slots and metallic surfaces, never gems, enamel or ground", () => {
    const { scene, band, prongs, unnamedMetal } = buildScene();
    const targets = collectMetalSkinTargets(scene);
    expect(targets.map((target) => target.mesh).sort((a, b) => a.id - b.id)).toEqual([band, prongs, unnamedMetal]);
  });

  it("swaps and restores materials on the clone only", () => {
    const { scene, band, stone } = buildScene();
    const original = band.material;
    const gold = new THREE.MeshPhysicalMaterial({ color: "#f5d785", metalness: 1 });
    const targets = collectMetalSkinTargets(scene);
    applyMetalSkin(targets, gold);
    expect(band.material).toBe(gold);
    expect(stone.material).not.toBe(gold);
    applyMetalSkin(targets, null);
    expect(band.material).toBe(original);
  });

  it("handles multi-material meshes per slot", () => {
    const scene = new THREE.Scene();
    const gem = new THREE.MeshPhysicalMaterial({ transmission: 1 });
    const metal = new THREE.MeshStandardMaterial({ metalness: 1 });
    const combo = mesh("Part", [metal, gem]);
    scene.add(combo);
    const targets = collectMetalSkinTargets(scene);
    expect(targets).toHaveLength(1);
    const platinum = new THREE.MeshStandardMaterial({ metalness: 1 });
    applyMetalSkin(targets, platinum);
    expect((combo.material as THREE.Material[])[0]).toBe(platinum);
    expect((combo.material as THREE.Material[])[1]).toBe(gem);
  });

  it("recognises traced and transmissive gems", () => {
    const traced = new THREE.MeshPhysicalMaterial();
    traced.userData.gemTrace = { bounces: 6 };
    expect(isGemLikeMaterial(traced)).toBe(true);
    expect(isGemLikeMaterial(new THREE.MeshPhysicalMaterial({ transmission: 0.5 }))).toBe(true);
    expect(isGemLikeMaterial(new THREE.MeshStandardMaterial({ metalness: 1 }))).toBe(false);
  });
});

describe("sampleModelPoints", () => {
  it("frames visible jewelry only (no ground shadow, no hidden parts)", () => {
    const { scene, enamel } = buildScene();
    enamel.visible = false;
    const bounds = sampleModelPoints(scene)!;
    expect(bounds.center.every((value) => Math.abs(value) < 1e-9)).toBe(true);
    expect(bounds.radius).toBeCloseTo(Math.sqrt(3) / 2, 6);
  });

  it("toggles contact shadows and hides studio-set pieces on the export clone", () => {
    const { scene, shadow, band } = buildScene();
    const set = new THREE.Group();
    set.userData.sceneSetupSet = true;
    const floor = mesh("Floor", new THREE.MeshBasicMaterial());
    floor.scale.set(60, 0.01, 60);
    set.add(floor);
    scene.add(set);
    const stage = createStageControl(scene);
    expect(stage.hasSet).toBe(true);
    stage.showShadows(false);
    stage.showSet(false);
    expect(shadow.visible).toBe(false);
    expect(floor.visible).toBe(false);
    expect(band.visible).toBe(true);
    stage.showSet(true);
    expect(floor.visible).toBe(true);
    stage.restore();
    expect(shadow.visible).toBe(true);
  });

  it("prepares cutouts as the piece alone and never un-hides hidden parts", () => {
    const { scene, shadow, enamel } = buildScene();
    enamel.visible = false;
    const set = new THREE.Group();
    set.userData.sceneSetupSet = true;
    const plinth = mesh("Plinth", new THREE.MeshStandardMaterial());
    const hiddenProp = mesh("Crystal", new THREE.MeshStandardMaterial());
    hiddenProp.visible = false;
    set.add(plinth, hiddenProp);
    scene.add(set);
    prepareCutoutScene(scene);
    expect([shadow.visible, plinth.visible, hiddenProp.visible, enamel.visible]).toEqual([false, false, false, false]);
    const stage = createStageControl(scene);
    stage.showSet(true);
    expect(hiddenProp.visible).toBe(false);
  });

  it("frames only the jewelry root when the studio tags it", () => {
    const { scene } = buildScene();
    const root = new THREE.Group();
    root.userData.jewelryModelRoot = true;
    root.position.set(5, 0, 0);
    root.add(mesh("Metal 2", new THREE.MeshStandardMaterial({ metalness: 1 })));
    scene.add(root);
    const bounds = sampleModelPoints(scene)!;
    expect(bounds.center[0]).toBeCloseTo(5, 6);
  });
});
