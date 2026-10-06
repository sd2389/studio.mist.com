import { convertUploadToGlb } from "@/lib/convert/to-glb";
import { normalizeSlotId } from "@/lib/slot-materials/material-rules";
import type { PersistedModelConfig, SceneSettingsBuckets } from "@/lib/slot-materials/model-config";
import { syncModelConfigFromLayers, type LayerRow } from "@/lib/upload/layer-state";
import type { ParsedUpload } from "@/lib/upload/parsed-upload";

/**
 * What Save makes of a parsed upload before anything is stored: the upload page saves it, and the
 * render worker's convert mode hands it to the worker (ADR 0006). One function for both, so a
 * bulk upload's scene is the scene the upload page would have made of the same file.
 */
export type ConvertedUpload = {
  glb: Blob;
  glbFilename: string;
  /** A 512 px WebP, or null when it couldn't be rendered (`warnings` says why). */
  thumbnail: Blob | null;
  /** The layers as reviewed, with the slot tokens and visibility the GLB was stamped with. */
  modelConfig: PersistedModelConfig;
  /** The parsed model's default materials, for the slots the model config has. */
  slotSelections: Record<string, string>;
  sceneSettings: SceneSettingsBuckets;
  polygonCount: number;
  /** What the conversion couldn't do and saved without: the thumbnail, compression. */
  warnings: string[];
};

/** The selections of slots the model config has; a slot no mesh fills (an empty layer) has none. */
function selectionsOfSlots(modelConfig: PersistedModelConfig, selections: Record<string, string>): Record<string, string> {
  const slots = new Set(modelConfig.slots.map((slot) => normalizeSlotId(slot.slotId)));
  return Object.fromEntries(Object.entries(selections).filter(([slot]) => slots.has(normalizeSlotId(slot))));
}

/**
 * Save's conversion: the layers synced into the model config, then the GLB (compressed where the
 * browser can) and its thumbnail, exported with the slots stamped on the model's meshes.
 */
export async function convertParsedUpload(parsed: ParsedUpload, layers: LayerRow[]): Promise<ConvertedUpload> {
  const synced = syncModelConfigFromLayers(parsed.modelConfig, parsed.preloaded.root, layers);
  const converted = await convertUploadToGlb(parsed.file, { modelConfig: synced, preloaded: parsed.preloaded });
  const modelConfig = { ...synced, slotTokens: converted.slotTokens, materialProps: converted.materialProps };
  return {
    glb: converted.glb,
    glbFilename: converted.glbFilename,
    thumbnail: converted.thumbnail,
    modelConfig,
    slotSelections: selectionsOfSlots(modelConfig, parsed.slotSelections),
    sceneSettings: parsed.sceneSettings,
    polygonCount: Math.max(0, Math.round(parsed.polyCount)),
    warnings: converted.warnings,
  };
}
