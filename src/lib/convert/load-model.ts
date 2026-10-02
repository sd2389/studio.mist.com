import { modelExtFromFilename, type ModelExt } from "@/lib/model-key";
import { createCompanionFiles } from "./companion-files";
import { normalizeModelUnits } from "./model-units";
import { collectRenderableMeshes, expandInstancedMeshes, rebuildAsJewelrySlots } from "./prepare-jewelry";
import { buildSlotTokensFromNames, collectNamesFromObject } from "./slot-names";
import type { FormatLoader, LoadedModel, ModelLoadOptions, ModelLoadStatus, ParsedModel } from "./types";

/**
 * Parses any supported jewelry CAD file in the browser into a three.js scene that the GLB
 * pipeline (`to-glb.ts`) exports. Each format's loader is its own lazily loaded chunk, so the
 * upload page only downloads the parser a dropped file needs.
 */
const FORMAT_LOADERS: Record<ModelExt, () => Promise<FormatLoader>> = {
  glb: () => import("./loaders/gltf").then((m) => m.loadGltf),
  gltf: () => import("./loaders/gltf").then((m) => m.loadGltf),
  "3dm": () => import("./loaders/rhino").then((m) => m.loadRhino),
  step: () => import("./loaders/occt").then((m) => m.loadStep),
  stp: () => import("./loaders/occt").then((m) => m.loadStep),
  iges: () => import("./loaders/occt").then((m) => m.loadIges),
  igs: () => import("./loaders/occt").then((m) => m.loadIges),
  obj: () => import("./loaders/obj").then((m) => m.loadObj),
  fbx: () => import("./loaders/fbx").then((m) => m.loadFbx),
  stl: () => import("./loaders/stl").then((m) => m.loadStl),
  ply: () => import("./loaders/ply").then((m) => m.loadPly),
  "3mf": () => import("./loaders/three-mf").then((m) => m.loadThreeMf),
};

function extOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

export function glbFilenameFrom(file: File): string {
  const stem = file.name.replace(/\.[^.]+$/, "") || "model";
  return `${stem}.glb`;
}

/** Let the browser paint a status update before the next synchronous step. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function finalizeModel(
  parsed: ParsedModel,
  onStatus: (status: ModelLoadStatus) => void,
): Promise<LoadedModel> {
  expandInstancedMeshes(parsed.root);
  if (parsed.slotSource === "shape") {
    onStatus({ message: "Detecting metal and stones…" });
    await yieldToBrowser();
    rebuildAsJewelrySlots(parsed.root);
  } else if (collectRenderableMeshes(parsed.root).length === 0) {
    throw new Error("No meshes found in this file");
  }
  const units = normalizeModelUnits(parsed.root, parsed.declaredMmPerUnit);
  const names = [...(parsed.extraSlotNames ?? []), ...collectNamesFromObject(parsed.root)];
  return { root: parsed.root, slotTokens: buildSlotTokensFromNames(names), units };
}

export async function loadModelFromFile(file: File, options: ModelLoadOptions = {}): Promise<LoadedModel> {
  const ext = modelExtFromFilename(file.name);
  if (!ext) throw new Error(`Unsupported model format: .${extOf(file.name) || "unknown"}`);
  const onStatus = options.onStatus ?? (() => undefined);
  const companions = createCompanionFiles(options.companions ?? []);
  try {
    const load = await FORMAT_LOADERS[ext]();
    const parsed = await load(file, { companions, onStatus });
    return await finalizeModel(parsed, onStatus);
  } finally {
    companions.dispose();
  }
}
