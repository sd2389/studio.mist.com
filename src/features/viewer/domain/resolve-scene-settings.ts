import type { SceneSettingsBuckets } from "@/lib/slot-materials/model-config";

/** Resolve legacy catalog IDs without dropping camera, exposure or custom background. */
export function resolveSceneSettings(settings: SceneSettingsBuckets, scenes?: readonly { _id: string; value?: string | null }[]): SceneSettingsBuckets {
  if (!scenes) return settings;
  const urls = new Map(scenes.map((item) => [item._id, item.value]));
  const resolve = (value: string | null) => value ? urls.get(value) || value : null;
  return {
    ...settings,
    "ENVIRONMENT-METAL": resolve(settings["ENVIRONMENT-METAL"]),
    "ENVIRONMENT-GEM": resolve(settings["ENVIRONMENT-GEM"]),
    GROUND: resolve(settings.GROUND),
    BACKGROUND: resolve(settings.BACKGROUND),
    VJSON: resolve(settings.VJSON),
  };
}
