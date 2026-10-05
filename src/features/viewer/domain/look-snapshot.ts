import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { useMaterialPresetStore } from "@/stores/material-preset-store";
import type { LookSnapshot } from "./saved-look";

/** The parts of the studio store a look is made of. */
export type LookState = Pick<
  ReturnType<typeof useMaterialPresetStore.getState>,
  "preset" | "lighting" | "finish" | "slotSelections" | "sceneSettings"
>;

/**
 * The studio's look as it saves it: what the autosave stores on the scene, and what an export
 * sends with its render job, so a job renders exactly what the studio would save (ADR 0005).
 * Selections for slots the model doesn't have are left out.
 */
export function lookSnapshot(state: LookState, modelConfig: PersistedModelConfig): LookSnapshot {
  return {
    material: state.preset,
    lighting: state.lighting,
    model_config: modelConfig,
    slot_selections: sanitizeSlotSelections(state.slotSelections, modelConfig),
    // The finish is saved with the look, so the embed shows it too.
    scene_settings: { ...state.sceneSettings, finish: state.finish },
  };
}
