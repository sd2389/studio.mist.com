import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import type {
  PersistedModelConfig,
  SceneSettingsBuckets,
} from "@/lib/slot-materials/model-config";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";

/** Snapshot of editor state saved into a named variant. */
export type ModelVariantSnapshot = {
  material: MaterialPresetId;
  lighting: LightingPresetId;
  slotSelections: Record<string, SlotMaterialRef>;
  sceneSettings: SceneSettingsBuckets;
  materialProps: Record<string, { visible: boolean }>;
};

export type ModelVariant = {
  id: string;
  name: string;
  snapshot: ModelVariantSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type SceneVariantsState = {
  activeVariantId: string | null;
  items: ModelVariant[];
};

export type VariantCaptureInput = {
  material: MaterialPresetId;
  lighting: LightingPresetId;
  slotSelections: Record<string, SlotMaterialRef>;
  sceneSettings: SceneSettingsBuckets;
  modelConfig: PersistedModelConfig;
};

export type VariantApplyCallbacks = {
  onModelConfigChange?: (config: PersistedModelConfig) => void;
};
