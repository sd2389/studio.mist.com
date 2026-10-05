import { afterEach, describe, expect, it } from "vitest";
import type { SceneDetail, SceneLook } from "@/lib/api/scenes";
import type { BackgroundItem, EnvironmentItem, GroundItem } from "@/lib/catalog/types";
import { buildModelConfigFromSlots, getDefaultSceneSettings } from "@/lib/slot-materials/model-config";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { useUserLibraryStore } from "@/stores/user-library-store";
import { lookStage } from "./look-stage";
import { applySavedLook, buildLookCatalogIndex, resolveModelConfig, type LookSnapshot } from "./saved-look";

const NO_ITEMS: SceneLook = { environments: [], backgrounds: [], grounds: [], metals: [], gems: [], user_materials: [] };

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

const ITEMS: SceneLook = {
  ...NO_ITEMS,
  environments: [environment("studio-small", "metal_env"), environment("gem-tent", "gem_env")],
  backgrounds: [backdrop],
  grounds: [ground],
  gems: [{ slug: "paraiba", label: "Paraiba", params: { ior: 1.62 }, sort_weight: 0, swatch_url: null, gem_family: "tourmaline" }],
};

const SETTINGS = {
  ...getDefaultSceneSettings(),
  "ENVIRONMENT-METAL": "studio-small",
  "ENVIRONMENT-GEM": "gem-tent",
  BACKGROUND: "dusk",
  GROUND: "soft-shadow",
  advanced: { exposure: 1.1, metalEnvRotation: 30 },
};

function savedScene(): SceneDetail {
  return {
    id: 812,
    name: "Solitaire",
    sku: "RING-1",
    category: null,
    note: null,
    model_key: "customers/1/models/ring.glb",
    model_url: "/ring.glb",
    material: "gold-18k-yellow",
    lighting: "soft",
    model_config: buildModelConfigFromSlots(["Metal 1", "Gem 1"]),
    slot_selections: { "Metal 1": "gold-18k-rose", "Gem 1": "catalog:paraiba" },
    scene_settings: { ...SETTINGS, finish: "satin" },
    thumbnail_key: null,
    thumbnail_url: null,
    created_at: "",
    updated_at: "",
    renders: [],
    look: ITEMS,
  };
}

/** What the studio, the embed and the harness each do with a look: the store, then `useLookStage`. */
function stageOf(look: LookSnapshot, items: SceneLook) {
  applySavedLook(look, items);
  const { preset, lighting, sceneSettings } = useMaterialPresetStore.getState();
  const modelConfig = resolveModelConfig(look);
  return lookStage({ modelUrl: "/ring.glb", preset, lighting, modelConfig, sceneSettings, catalog: buildLookCatalogIndex(null, items) });
}

afterEach(() => {
  useCatalogParamsStore.setState({ metals: {}, gems: {} });
  useUserLibraryStore.setState({ materialsById: {} });
});

describe("lookStage", () => {
  const base = {
    modelUrl: "/ring.glb",
    preset: "platinum" as const,
    lighting: "dramatic" as const,
    modelConfig: buildModelConfigFromSlots(["Metal 1"]),
    sceneSettings: SETTINGS,
  };

  it("draws the model with the look's materials, lighting and settings", () => {
    const stage = lookStage({ ...base, catalog: buildLookCatalogIndex(null, ITEMS) });
    expect(stage).toMatchObject({ modelUrl: "/ring.glb", preset: "platinum", lighting: "dramatic", modelConfig: base.modelConfig });
    expect(stage.sceneSettings).toEqual(SETTINGS);
  });

  it("finds the environments, backdrop and ground the settings name among the look's items", () => {
    const stage = lookStage({ ...base, catalog: buildLookCatalogIndex(null, ITEMS) });
    expect(stage.metalEnvironment?.slug).toBe("studio-small");
    expect(stage.gemEnvironment?.env_type).toBe("gem_env");
    expect(stage.backgroundItem).toEqual(backdrop);
    expect(stage.groundItem).toEqual(ground);
  });

  it("draws the lighting preset's own set when the look names no catalogue items", () => {
    const stage = lookStage({ ...base, catalog: buildLookCatalogIndex(null, NO_ITEMS) });
    expect(stage.metalEnvironment).toBeNull();
    expect(stage.gemEnvironment).toBeNull();
    expect(stage.backgroundItem).toBeNull();
    expect(stage.groundItem).toBeNull();
  });

  it("resolves catalogue ids saved before slugs, keeping the rest of the settings", () => {
    const stage = lookStage({
      ...base,
      sceneSettings: { ...SETTINGS, BACKGROUND: "bg_0042" },
      catalog: buildLookCatalogIndex(null, ITEMS),
      sourceScenes: [{ _id: "bg_0042", value: "dusk" }],
    });
    expect(stage.sceneSettings.BACKGROUND).toBe("dusk");
    expect(stage.sceneSettings.advanced).toEqual(SETTINGS.advanced);
  });
});

describe("a look, applied", () => {
  it("draws a render job's look exactly as the embed draws the scene it was copied from", () => {
    const scene = savedScene();
    const fromScene = stageOf(scene, scene.look!);
    const fromScenePieces = useMaterialPresetStore.getState();

    // The API copies the look into the job as JSON (ADR 0005), with the items it names.
    const job = JSON.parse(
      JSON.stringify({
        look: {
          material: scene.material,
          lighting: scene.lighting,
          slot_selections: scene.slot_selections,
          scene_settings: scene.scene_settings,
          model_config: scene.model_config,
        },
        look_items: scene.look,
      }),
    ) as { look: LookSnapshot; look_items: SceneLook };
    // The harness starts from a fresh page: nothing in the store, no materials registered.
    useMaterialPresetStore.setState({ preset: "original", lighting: "studio", finish: "polished", slotSelections: {} });
    useCatalogParamsStore.setState({ metals: {}, gems: {} });
    const fromJob = stageOf(job.look, job.look_items);
    const fromJobPieces = useMaterialPresetStore.getState();

    expect(fromJob).toEqual(fromScene);
    expect(fromJobPieces.finish).toBe("satin");
    expect(fromJobPieces.slotSelections).toEqual(fromScenePieces.slotSelections);
    expect(useCatalogParamsStore.getState().gems.paraiba).toBeDefined();
  });
});
