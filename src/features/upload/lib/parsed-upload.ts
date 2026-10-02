import type { inspectModelFromFile } from "@/lib/convert/to-glb";
import type { LoadedModel } from "@/lib/convert/types";
import {
  buildModelConfigFromSlots,
  getDefaultSceneSettings,
  type PersistedModelConfig,
} from "@/lib/slot-materials/model-config";
import { countPolygons } from "@/lib/upload/count-polygons";
import { formatPolyCount } from "@/lib/upload/polygon-limits";

export type ParsedUpload = {
  file: File;
  preloaded: LoadedModel;
  modelConfig: PersistedModelConfig;
  slotSelections: Record<string, string>;
  sceneSettings: ReturnType<typeof getDefaultSceneSettings>;
  polyCount: number;
};

type InspectedModel = Awaited<ReturnType<typeof inspectModelFromFile>>;

/** Mirrors the server's 402 detail so both gates read the same. */
export function overPolyLimitMessage(planLabel: string, cap: number): string {
  return `Polygon limit exceeded for ${planLabel} (max ${formatPolyCount(cap)}). Upgrade your plan or decimate the mesh.`;
}

export function buildParsedUpload(file: File, inspected: InspectedModel): ParsedUpload {
  const polyCount = countPolygons(inspected.loaded.root);
  const slots = Object.keys(inspected.loaded.slotTokens);
  const slotNames =
    slots.length > 0
      ? slots
      : Object.keys(inspected.materialProps).length > 0
        ? Object.keys(inspected.materialProps)
        : ["Metal 01"];

  const modelConfig = buildModelConfigFromSlots(slotNames);
  modelConfig.slotTokens = inspected.loaded.slotTokens;
  modelConfig.materialProps = inspected.materialProps;

  return {
    file,
    preloaded: inspected.loaded,
    modelConfig,
    slotSelections: modelConfig.defaultMaterials,
    sceneSettings: getDefaultSceneSettings(),
    polyCount,
  };
}

export function parseErrorMessage(err: unknown, filename = ""): string {
  if (!(err instanceof Error)) return "Could not parse model";
  const ext = filename.toLowerCase().split(".").at(-1) ?? "";
  if (err.message.includes("Rhino") || ext === "3dm") {
    return "Could not parse this .3dm file. Check that it is a valid Rhino model with at least one mesh.";
  }
  if (/CAD kernel/.test(err.message)) {
    return `${err.message}. STEP and IGES need a one-time download — check your connection and try again.`;
  }
  if (ext === "fbx" && /version|binary|ascii/i.test(err.message)) {
    return `Could not parse this .fbx file (${err.message}). Re-export as FBX 2013 or newer.`;
  }
  return err.message;
}

/** "21.4 × 21.4 × 6.2 mm" from the detected real-world size. */
export function formatModelSizeMm(loaded: LoadedModel): string | null {
  const size = loaded.units?.sizeMm;
  if (!size) return null;
  return `${size.map((value) => (value >= 100 ? value.toFixed(0) : value.toFixed(1))).join(" × ")} mm`;
}
