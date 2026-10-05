import {
  lookupBackground,
  lookupEnvironment,
  lookupGround,
  type SceneCatalogIndex,
} from "@/lib/catalog/scene-catalog-index";
import type { BackgroundItem, EnvironmentItem, GroundItem } from "@/lib/catalog/types";
import type { PersistedModelConfig, SceneSettingsBuckets } from "@/lib/slot-materials/model-config";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { resolveSceneSettings } from "./resolve-scene-settings";

/** Everything `ViewerStage` draws a look with, besides auto-rotation and the frame loop. */
export type LookStage = {
  modelUrl: string;
  preset: MaterialPresetId;
  lighting: LightingPresetId;
  modelConfig: PersistedModelConfig;
  sceneSettings: SceneSettingsBuckets;
  metalEnvironment: EnvironmentItem | null;
  gemEnvironment: EnvironmentItem | null;
  backgroundItem: BackgroundItem | null;
  groundItem: GroundItem | null;
};

export type LookStageInput = Pick<LookStage, "modelUrl" | "preset" | "lighting" | "modelConfig" | "sceneSettings"> & {
  /** What the look's catalogue slugs resolve against (`buildLookCatalogIndex`). */
  catalog: SceneCatalogIndex;
  /** The source catalogue's scenes, for looks saved with legacy catalogue ids. */
  sourceScenes?: readonly { _id: string; value?: string | null }[];
};

/**
 * A look, as the studio store holds it, turned into stage props: the scene settings with
 * legacy ids resolved, and the catalogue environments, backdrop and ground they name.
 */
export function lookStage({ catalog, sourceScenes, ...look }: LookStageInput): LookStage {
  const { sceneSettings } = look;
  return {
    ...look,
    sceneSettings: resolveSceneSettings(sceneSettings, sourceScenes),
    metalEnvironment: lookupEnvironment(catalog, sceneSettings["ENVIRONMENT-METAL"]),
    gemEnvironment: lookupEnvironment(catalog, sceneSettings["ENVIRONMENT-GEM"]),
    backgroundItem: lookupBackground(catalog, sceneSettings.BACKGROUND),
    groundItem: lookupGround(catalog, sceneSettings.GROUND),
  };
}
