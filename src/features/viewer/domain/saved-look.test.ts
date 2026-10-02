import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  lookupBackground,
  lookupEnvironment,
  lookupGround,
} from "@/features/editor/hooks/useSceneCatalogIndex";
import type { SceneDetail, SceneLook } from "@/lib/api/scenes";
import { applyMaterialPresetBySlot } from "@/lib/apply-material-preset";
import type { EditCatalogs } from "@/lib/catalog/edit-catalogs";
import type { BackgroundItem, EnvironmentItem, GroundItem } from "@/lib/catalog/types";
import { buildModelConfigFromSlots, getDefaultSceneSettings } from "@/lib/slot-materials/model-config";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { useUserLibraryStore } from "@/stores/user-library-store";
import { buildLookCatalogIndex, registerLookMaterials, savedFinish, savedLook } from "./saved-look";
import { shouldPersistViewerScene } from "./viewer-scene-persist";

const NO_LOOK: SceneLook = { environments: [], backgrounds: [], grounds: [], metals: [], gems: [], user_materials: [] };

function savedScene(overrides: Partial<SceneDetail> = {}): SceneDetail {
  return {
    id: 1,
    name: "Solitaire",
    sku: "RING-1",
    category: null,
    note: null,
    model_key: "customers/1/models/ring.glb",
    model_url: "/ring.glb",
    material: "platinum",
    lighting: "dramatic",
    model_config: buildModelConfigFromSlots(["Metal 1", "Gem 1"]),
    slot_selections: { "Metal 1": "gold-18k-rose", "Gem 1": "ruby" },
    scene_settings: {
      ...getDefaultSceneSettings(),
      sceneSetup: "velvet",
      advanced: { exposure: 1.2, metalEnvRotation: 40 },
      activePoseId: "three-quarter",
      finish: "brushed",
    },
    thumbnail_key: null,
    thumbnail_url: null,
    created_at: "",
    updated_at: "",
    renders: [],
    look: NO_LOOK,
    ...overrides,
  };
}

const environment = (slug: string, env_type: EnvironmentItem["env_type"]): EnvironmentItem => ({
  slug,
  label: slug,
  params: {},
  sort_weight: 0,
  swatch_url: null,
  env_type,
  preview_url: null,
  master_url: `/catalog/env/${slug}.hdr`,
  default_rotation: 0,
  default_intensity: 1,
});
const backdrop: BackgroundItem = {
  slug: "dusk",
  label: "Dusk",
  params: { kind: "linear", angle: 180, stops: [] },
  sort_weight: 0,
  swatch_url: null,
  is_transparent: false,
};
const ground: GroundItem = { slug: "soft-shadow", label: "Soft", params: { opacity: 0.3 }, sort_weight: 0, swatch_url: null };

/** A ring with one metal and one stone slot, as the slot materials find them by name. */
function slottedRing(): { root: THREE.Group; metal: THREE.Mesh; gem: THREE.Mesh } {
  const root = new THREE.Group();
  const metal = new THREE.Mesh(new THREE.TorusGeometry(), new THREE.MeshPhysicalMaterial());
  metal.name = "Metal 1";
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(), new THREE.MeshPhysicalMaterial());
  gem.name = "Gem 1";
  root.add(metal, gem);
  return { root, metal, gem };
}

function physical(mesh: THREE.Mesh): THREE.MeshPhysicalMaterial {
  return mesh.material as THREE.MeshPhysicalMaterial;
}

afterEach(() => {
  useCatalogParamsStore.setState({ metals: {}, gems: {} });
  useUserLibraryStore.setState({ materialsById: {} });
});

describe("savedLook", () => {
  it("is the preset, lighting, finish, slot materials and settings the scene was saved with", () => {
    const look = savedLook(savedScene());
    expect(look.preset).toBe("platinum");
    expect(look.lighting).toBe("dramatic");
    expect(look.finish).toBe("brushed");
    expect(look.slotSelections).toEqual({ "Metal 1": "gold-18k-rose", "Gem 1": "ruby" });
    expect(look.sceneSettings.sceneSetup).toBe("velvet");
    expect(look.sceneSettings.advanced).toEqual({ exposure: 1.2, metalEnvRotation: 40 });
    expect(look.sceneSettings.activePoseId).toBe("three-quarter");
    // The finish lives in the store; the studio saves it back into the settings.
    expect("finish" in look.sceneSettings).toBe(false);
    const resaved = savedScene({ scene_settings: { ...look.sceneSettings, finish: "satin" } });
    expect(savedLook(resaved).finish).toBe("satin");
  });

  it("treats a look saved before the finish was kept, or with an unknown one, as polished", () => {
    expect(savedFinish(undefined)).toBe("polished");
    expect(savedFinish("glitter")).toBe("polished");
    expect(savedLook(savedScene({ scene_settings: getDefaultSceneSettings() })).finish).toBe("polished");
  });

  it("drops slots the model does not have and coerces a metal onto a stone slot", () => {
    const look = savedLook(
      savedScene({ slot_selections: { "Metal 1": "platinum", "Gem 1": "gold-18k-yellow", "Gem 9": "ruby" } }),
    );
    expect(look.slotSelections).toEqual({ "Metal 1": "platinum", "Gem 1": "diamond" });
  });
});

describe("registerLookMaterials", () => {
  const look: SceneLook = {
    ...NO_LOOK,
    gems: [{ slug: "paraiba", label: "Paraiba", params: { ior: 1.62, baseColor: "#3fd8d0" }, sort_weight: 0, swatch_url: null, gem_family: "tourmaline" }],
    user_materials: [{ id: 7, kind: "metal", slug: "house-gold", label: "House gold", params: { color: "#123456" }, swatch_url: null, sort_weight: 0 }],
  };
  const scene = savedScene({ slot_selections: { "Metal 1": "custom:7", "Gem 1": "catalog:paraiba" }, look });

  it("draws the jeweler's library and catalogue materials, which the embed cannot browse", () => {
    const unresolved = slottedRing();
    const before = savedLook(scene);
    applyMaterialPresetBySlot(unresolved.root, before.slotSelections, before.preset, undefined, before.finish);
    expect(physical(unresolved.metal).color.getHexString()).not.toBe("123456");

    registerLookMaterials(scene.look);
    const ring = slottedRing();
    const after = savedLook(scene);
    applyMaterialPresetBySlot(ring.root, after.slotSelections, after.preset, undefined, after.finish);
    expect(physical(ring.metal).color.getHexString()).toBe("123456");
    expect(physical(ring.gem).ior).toBeCloseTo(1.62);
  });

  it("adds to the library already loaded instead of replacing it", () => {
    const own = { id: 3, kind: "gem" as const, slug: "mine", label: "Mine", params: {}, swatch_url: null, sort_weight: 0 };
    useUserLibraryStore.getState().hydrateMaterials([own]);
    registerLookMaterials(scene.look);
    expect(useUserLibraryStore.getState().getMaterial(3)).toEqual(own);
    expect(useUserLibraryStore.getState().getMaterial(7)?.params).toEqual({ color: "#123456" });
  });
});

describe("buildLookCatalogIndex", () => {
  it("resolves the saved environments, backdrop and ground from the scene alone", () => {
    const look = {
      ...NO_LOOK,
      environments: [environment("studio-small", "metal_env"), environment("gem-tent", "gem_env")],
      backgrounds: [backdrop],
      grounds: [ground],
    };
    const index = buildLookCatalogIndex(null, look);
    expect(lookupEnvironment(index, "studio-small")?.master_url).toBe("/catalog/env/studio-small.hdr");
    expect(lookupEnvironment(index, "gem-tent")?.env_type).toBe("gem_env");
    expect(lookupBackground(index, "dusk")).toEqual(backdrop);
    expect(lookupGround(index, "soft-shadow")).toEqual(ground);
  });

  it("keeps resolving what the Edit tab has paged in", () => {
    const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 48, offset: 0 });
    const catalogs = {
      metalEnvironments: page([environment("from-page", "metal_env")]),
      gemEnvironments: null,
      backgrounds: page([backdrop]),
      grounds: null,
      scenePresets: null,
    } as unknown as EditCatalogs;
    const index = buildLookCatalogIndex(catalogs, { ...NO_LOOK, grounds: [ground] });
    expect(lookupEnvironment(index, "from-page")).not.toBeNull();
    expect(lookupBackground(index, "dusk")).toEqual(backdrop);
    expect(lookupGround(index, "soft-shadow")).toEqual(ground);
  });
});

describe("the embed", () => {
  it("never saves: it shows the scene as saved", () => {
    expect(shouldPersistViewerScene("embed")).toBe(false);
    expect(shouldPersistViewerScene("studio")).toBe(true);
  });
});
