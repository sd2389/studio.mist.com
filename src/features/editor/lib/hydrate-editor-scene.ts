import type { SceneDetail } from "@/lib/api/scenes";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import { buildModelConfigFromSlots, getDefaultSceneSettings } from "@/lib/slot-materials/model-config";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

export function resolveModelConfigFromScene(scene: SceneDetail) {
  return scene.model_config?.slots?.length
    ? scene.model_config
    : buildModelConfigFromSlots(Object.keys(scene.slot_selections ?? {}));
}

/** Apply SSR-fetched scene into the client store before first paint. */
export function hydrateEditorSceneStore(scene: SceneDetail): void {
  const modelConfig = resolveModelConfigFromScene(scene);
  const safeSelections = sanitizeSlotSelections(
    (scene.slot_selections ?? {}) as Record<string, SlotMaterialRef>,
    modelConfig,
  );
  const store = useMaterialPresetStore.getState();
  store.setPreset(scene.material as MaterialPresetId);
  store.setLighting(scene.lighting as LightingPresetId);
  store.replaceSlotSelections(safeSelections);
  store.replaceSceneSettings(scene.scene_settings ?? getDefaultSceneSettings());
}
