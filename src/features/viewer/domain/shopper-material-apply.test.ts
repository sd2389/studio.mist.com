import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { applyMaterialPresetBySlot } from "@/lib/apply-material-preset";
import {
  gemPresetIdFromMaterial,
  isGemGpuMaterial,
} from "@/lib/gem-gpu/gem-physical-material";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import {
  applyShopperMaterial,
  selectedShopperPreset,
  shopperSlotsForKind,
} from "@/features/viewer/domain/shopper-material-apply";
import { shouldPersistViewerScene } from "@/features/viewer/domain/viewer-scene-persist";

afterEach(() => {
  useMaterialPresetStore.setState({
    preset: "original",
    slotSelections: {},
  });
});

describe("shopper material apply", () => {
  it("targets published metal and gem slots from model config", () => {
    const modelConfig = buildModelConfigFromSlots(["Metal 1", "Gem 1", "Accent 1"]);
    expect(shopperSlotsForKind(modelConfig, "metal")).toEqual(["Metal 1"]);
    expect(shopperSlotsForKind(modelConfig, "gem")).toEqual(["Accent 1", "Gem 1"]);
  });

  it("falls back to Metal 1 / Gem 1 when config has no matching slots", () => {
    const modelConfig = {
      ...buildModelConfigFromSlots(["Metal 1"]),
      slots: [],
    };
    expect(shopperSlotsForKind(modelConfig, "metal")).toEqual(["Metal 1"]);
    expect(shopperSlotsForKind(modelConfig, "gem")).toEqual(["Gem 1"]);
  });

  it("writes metal and gem selections independently", () => {
    const modelConfig = publishedSkuConfig();
    const store = useMaterialPresetStore.getState();

    applyShopperMaterial({
      kind: "metal",
      preset: "gold-18k-rose",
      modelConfig,
      setSlotPreset: store.setSlotPreset,
      setPreset: store.setPreset,
    });
    applyShopperMaterial({
      kind: "gem",
      preset: "ruby",
      modelConfig,
      setSlotPreset: store.setSlotPreset,
      setPreset: store.setPreset,
    });

    const next = useMaterialPresetStore.getState();
    expect(next.slotSelections["Metal 1"]).toBe("gold-18k-rose");
    expect(next.slotSelections["Gem 1"]).toBe("ruby");
    expect(
      selectedShopperPreset("metal", ["Metal 1"], next.slotSelections, next.preset),
    ).toBe("gold-18k-rose");
    expect(
      selectedShopperPreset("gem", ["Gem 1"], next.slotSelections, next.preset),
    ).toBe("ruby");
  });
});

describe("shopper embed viewer visibility", () => {
  it("applies shopper metal and gem picks onto slot meshes", () => {
    const root = makePublishedSkuFixture();
    const modelConfig = publishedSkuConfig();
    const store = useMaterialPresetStore.getState();

    applyShopperMaterial({
      kind: "metal",
      preset: "gold-14k-yellow",
      modelConfig,
      setSlotPreset: store.setSlotPreset,
      setPreset: store.setPreset,
    });
    applyShopperMaterial({
      kind: "gem",
      preset: "diamond",
      modelConfig,
      setSlotPreset: store.setSlotPreset,
      setPreset: store.setPreset,
    });

    let state = useMaterialPresetStore.getState();
    applyMaterialPresetBySlot(root, state.slotSelections, state.preset);

    const metal = meshByName(root, "Metal 1");
    const gem = meshByName(root, "Gem 1");
    expect(metalColor(metal)).toBe("edd09a");
    expect(isGemGpuMaterial(asPhysical(gem))).toBe(true);
    expect(gemPresetIdFromMaterial(asPhysical(gem))).toBe("diamond");

    applyShopperMaterial({
      kind: "metal",
      preset: "gold-18k-rose",
      modelConfig,
      setSlotPreset: store.setSlotPreset,
      setPreset: store.setPreset,
    });
    applyShopperMaterial({
      kind: "gem",
      preset: "ruby",
      modelConfig,
      setSlotPreset: store.setSlotPreset,
      setPreset: store.setPreset,
    });

    state = useMaterialPresetStore.getState();
    applyMaterialPresetBySlot(root, state.slotSelections, state.preset);

    expect(metalColor(metal)).toBe("e8b3a5");
    expect(gemPresetIdFromMaterial(asPhysical(gem))).toBe("ruby");
    expect(metalColor(metal)).not.toBe(metalColor(gem));

    disposeFixture(root);
  });
});

describe("embed shopper wiring", () => {
  it("keeps shopper embed session-only", () => {
    expect(shouldPersistViewerScene("embed")).toBe(false);
    expect(shouldPersistViewerScene("studio")).toBe(true);
  });

  it("mounts Metal + Gem shopper controls on the embed shell", () => {
    const shell = readFileSync(
      path.join(process.cwd(), "src/features/viewer/ui/ViewerShell.tsx"),
      "utf8",
    );
    expect(shell.includes("EmbedShopperMaterials")).toBe(true);
    expect(shell.includes("shouldPersistViewerScene")).toBe(true);

    const shopper = readFileSync(
      path.join(process.cwd(), "src/features/viewer/ui/EmbedShopperMaterials.tsx"),
      "utf8",
    );
    expect(shopper.includes('"Metal"')).toBe(true);
    expect(shopper.includes('"Gem"')).toBe(true);
  });
});

function publishedSkuConfig() {
  return buildModelConfigFromSlots(["Metal 1", "Gem 1"]);
}

function makePublishedSkuFixture(): THREE.Group {
  const root = new THREE.Group();
  root.add(namedBox("Metal 1"));
  root.add(namedBox("Gem 1"));
  return root;
}

function namedBox(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x111111 }),
  );
  mesh.name = name;
  return mesh;
}

function meshByName(root: THREE.Object3D, name: string): THREE.Mesh {
  const found = root.getObjectByName(name);
  if (!(found instanceof THREE.Mesh)) {
    throw new Error(`missing mesh ${name}`);
  }
  return found;
}

function asPhysical(mesh: THREE.Mesh): THREE.MeshPhysicalMaterial {
  const material = mesh.material;
  if (!(material instanceof THREE.MeshPhysicalMaterial)) {
    throw new Error(`expected MeshPhysicalMaterial on ${mesh.name}`);
  }
  return material;
}

function metalColor(mesh: THREE.Mesh): string {
  return asPhysical(mesh).color.getHexString();
}

function disposeFixture(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    const material = obj.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
  });
}
