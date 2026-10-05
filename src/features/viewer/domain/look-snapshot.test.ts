import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildModelConfigFromSlots,
  getDefaultSceneSettings,
  type SceneSettingsBuckets,
} from "@/lib/slot-materials/model-config";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { lookSnapshot } from "./look-snapshot";

const MODEL_CONFIG = buildModelConfigFromSlots(["Metal 1", "Gem 1"]);

const SCENE_SETTINGS: SceneSettingsBuckets = {
  ...getDefaultSceneSettings(),
  BACKGROUND: "paper-warm",
  advanced: { exposure: 1.1, metalEnvRotation: 30 },
  poses: [{ id: "pose-hero", name: "Hero", cameraPosition: [1.2, 0.6, 1.8], target: [0, 0, 0] }],
};

function readSource(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("lookSnapshot", () => {
  beforeEach(() => {
    useMaterialPresetStore.setState({
      preset: "gold-18k-yellow",
      lighting: "dramatic",
      finish: "satin",
      // An alias of the model's metal slot, a metal on the gem, and a slot the model doesn't have.
      slotSelections: { metal1: "gold-18k-rose", "Gem 1": "gold-18k-white", "Accent 3": "ruby" },
      sceneSettings: SCENE_SETTINGS,
    });
  });

  it("is the scene the studio autosaves", () => {
    expect(lookSnapshot(useMaterialPresetStore.getState(), MODEL_CONFIG)).toEqual({
      material: "gold-18k-yellow",
      lighting: "dramatic",
      model_config: MODEL_CONFIG,
      // The model's own slots only, each wearing a material it can take.
      slot_selections: { "Metal 1": "gold-18k-rose", "Gem 1": "diamond" },
      // The store keeps the finish beside the settings; the scene keeps it in them.
      scene_settings: { ...SCENE_SETTINGS, finish: "satin" },
    });
  });

  it("is the same from the whole store, as an export reads it, and from the fields the autosave watches", () => {
    const store = useMaterialPresetStore.getState();
    const { preset, lighting, finish, slotSelections, sceneSettings } = store;

    expect(lookSnapshot({ preset, lighting, finish, slotSelections, sceneSettings }, MODEL_CONFIG)).toEqual(
      lookSnapshot(store, MODEL_CONFIG),
    );
  });

  it("is what the autosave saves, and the autosave builds no look of its own", () => {
    const source = readSource("src/features/viewer/ui/useSavedScene.ts");
    const watched = [...source.matchAll(/const (\w+) = useMaterialPresetStore\(\(s\) => s\.(\w+)\)/g)]
      .filter(([, name, field]) => name === field)
      .map(([, name]) => name);

    expect(watched).toEqual(expect.arrayContaining(["preset", "lighting", "finish", "slotSelections", "sceneSettings"]));
    expect(source).toMatch(
      /const persistPayload = useMemo\(\s*\(\) => lookSnapshot\(\{ preset, lighting, finish, slotSelections, sceneSettings \}, modelConfig\),/,
    );
    expect(source).toContain("updateSceneByViewerId(modelId, persistPayload)");
    expect(source).not.toMatch(/slot_selections|scene_settings|sanitizeSlotSelections/);
  });
});
