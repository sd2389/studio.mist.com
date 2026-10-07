import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { glbFilenameFrom, loadModelFromFile } from "./load-model";
import { simplifyMaterialsForExport } from "./simplify-for-export";
import { fitModelToUnit, stampSlotMetadata } from "./stamp-slots";
import { generateModelThumbnail } from "./thumbnail";
import { cloneOwnedModel } from "./clone-owned-model";
import type { ConvertToGlbOptions, ConvertToGlbResult, LoadedModel, ModelLoadOptions } from "./types";

/** Larger GLBs are stored as exported: compressing them in a tab takes too long and too much memory. */
const COMPRESS_MAX_BYTES = 12 * 1024 * 1024;

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** The thumbnail, or null and a warning: a model saves without one rather than not at all. */
async function renderThumbnail(root: THREE.Object3D, warnings: string[]): Promise<Blob | null> {
  try {
    return await generateModelThumbnail(root);
  } catch (error) {
    console.warn("[convert] thumbnail failed, saving without one:", error);
    warnings.push(`The thumbnail could not be rendered (${reasonOf(error)}), so the piece has none.`);
    return null;
  }
}

/** meshopt and Draco in the browser; the GLB as exported, and a warning, when that can't be done. */
async function compressInBrowser(glb: ArrayBuffer, warnings: string[]): Promise<ArrayBuffer> {
  if (glb.byteLength > COMPRESS_MAX_BYTES) {
    warnings.push(`The GLB is ${megabytes(glb.byteLength)}, more than the ${megabytes(COMPRESS_MAX_BYTES)} compressed in the browser, so it is stored uncompressed.`);
    return glb;
  }
  try {
    const { compressGlbBuffer } = await import("./compress-glb.client");
    return await compressGlbBuffer(glb);
  } catch (err) {
    console.warn("[convert] compression failed, using uncompressed GLB:", err);
    warnings.push(`The GLB could not be compressed (${reasonOf(err)}), so it is stored uncompressed.`);
    return glb;
  }
}

function exportSceneToGlb(root: THREE.Object3D): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      root,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
          return;
        }
        reject(new Error("Expected binary GLB export"));
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true, onlyVisible: true, embedImages: true, truncateDrawRange: true },
    );
  });
}

export type InspectedModel = {
  loaded: LoadedModel;
  materialProps: Record<string, { visible: boolean }>;
  glbFilename: string;
};

/** Parse CAD in-browser for slot review — no GLB export yet. */
export async function inspectModelFromFile(
  file: File,
  options: ModelLoadOptions = {},
): Promise<InspectedModel> {
  const loaded = await loadModelFromFile(file, options);
  fitModelToUnit(loaded.root);
  const materialProps = stampSlotMetadata(loaded.root, { slotTokens: loaded.slotTokens });
  return {
    loaded,
    materialProps,
    glbFilename: glbFilenameFrom(file),
  };
}

export async function convertUploadToGlb(
  file: File,
  options: ConvertToGlbOptions & { preloaded?: LoadedModel } = {},
): Promise<ConvertToGlbResult> {
  const { compress = true, generateThumbnail = true, modelConfig, preloaded } = options;
  const loaded = preloaded ?? (await loadModelFromFile(file));
  const slotTokens = modelConfig?.slotTokens ?? loaded.slotTokens;

  if (!preloaded) {
    fitModelToUnit(loaded.root);
  }

  const materialProps = stampSlotMetadata(loaded.root, {
    modelConfig,
    slotTokens,
    materialProps: modelConfig?.materialProps,
  });

  const warnings: string[] = [];
  const thumbnail = generateThumbnail ? await renderThumbnail(loaded.root, warnings) : null;

  const exportRoot = cloneOwnedModel(loaded.root);
  stampSlotMetadata(exportRoot, { slotTokens, materialProps });
  simplifyMaterialsForExport(exportRoot);

  let glbBuffer: ArrayBuffer;
  try {
    glbBuffer = await exportSceneToGlb(exportRoot);
  } finally {
    disposeObject3D(exportRoot);
  }

  // Compression only runs in a browser, where the upload page and the render worker convert.
  if (compress && typeof window !== "undefined") glbBuffer = await compressInBrowser(glbBuffer, warnings);

  const glb = new Blob([glbBuffer], { type: "model/gltf-binary" });

  return {
    glb,
    glbFilename: glbFilenameFrom(file),
    thumbnail,
    slotTokens,
    materialProps,
    warnings,
  };
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry?.dispose();
    const mat = obj.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

export { loadModelFromFile } from "./load-model";
