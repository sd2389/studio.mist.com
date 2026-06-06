import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { glbFilenameFrom, loadModelFromFile } from "./load-model";
import { simplifyMaterialsForExport } from "./simplify-for-export";
import { fitModelToUnit, stampSlotMetadata } from "./stamp-slots";
import { generateModelThumbnail } from "./thumbnail";
import type { ConvertToGlbOptions, ConvertToGlbResult, LoadedModel } from "./types";

const COMPRESS_MAX_BYTES = 12 * 1024 * 1024;

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

/** Parse CAD in-browser for slot review — no GLB export (fast path for .3dm). */
export async function inspectModelFromFile(file: File): Promise<InspectedModel> {
  const loaded = await loadModelFromFile(file);
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

  const thumbnail = generateThumbnail ? await generateModelThumbnail(loaded.root) : null;

  const exportRoot = loaded.root.clone(true);
  stampSlotMetadata(exportRoot, { slotTokens, materialProps });
  simplifyMaterialsForExport(exportRoot);

  let glbBuffer = await exportSceneToGlb(exportRoot);
  disposeObject3D(exportRoot);

  if (
    compress &&
    typeof window !== "undefined" &&
    glbBuffer.byteLength <= COMPRESS_MAX_BYTES
  ) {
    try {
      const { compressGlbBuffer } = await import("./compress-glb.client");
      glbBuffer = await compressGlbBuffer(glbBuffer);
    } catch (err) {
      console.warn("[convert] compression failed, using uncompressed GLB:", err);
    }
  }

  const glb = new Blob([glbBuffer], { type: "model/gltf-binary" });

  return {
    glb,
    glbFilename: glbFilenameFrom(file),
    thumbnail,
    slotTokens,
    materialProps,
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
