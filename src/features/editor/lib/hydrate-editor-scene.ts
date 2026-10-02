import type { SceneDetail } from "@/lib/api/scenes";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";

export function resolveModelConfigFromScene(scene: SceneDetail) {
  return scene.model_config?.slots?.length
    ? scene.model_config
    : buildModelConfigFromSlots(Object.keys(scene.slot_selections ?? {}));
}

/** Apply SSR-fetched scene into the client store before first paint. */
