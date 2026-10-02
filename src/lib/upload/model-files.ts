import {
  isModelCompanionFilename,
  isSupportedModelFilename,
  MODEL_COMPANION_EXTS,
  SUPPORTED_MODEL_EXTS,
} from "@/lib/model-key";

/** The model a user picked plus the files it references (MTL, textures, glTF buffers). */
export type ModelFileSet = { primary: File; companions: File[] };

/** Upload copy, in the order jewelers reach for the formats. */
export const SUPPORTED_FORMATS_LABEL = "3DM, STEP, IGES, OBJ (+MTL), FBX, STL, PLY, 3MF, GLB, glTF";

const MODEL_MIME_TYPES = [
  "model/gltf-binary",
  "model/gltf+json",
  "model/stl",
  "application/sla",
  "model/vnd.rhino",
  "model/obj",
  "model/step",
  "model/iges",
  "model/3mf",
];

/** `accept` for the file input: every model format plus the companions an OBJ/glTF may need. */
export const MODEL_FILE_ACCEPT = [...SUPPORTED_MODEL_EXTS, ...MODEL_COMPANION_EXTS]
  .map((ext) => `.${ext}`)
  .concat(MODEL_MIME_TYPES)
  .join(",");

/** First supported model among the files, with the companions dropped alongside it. */
export function groupModelFiles(files: File[]): ModelFileSet | null {
  const primary = files.find((file) => isSupportedModelFilename(file.name));
  if (!primary) return null;
  const companions = files.filter((file) => file !== primary && isModelCompanionFilename(file.name));
  return { primary, companions };
}

export function unsupportedFilesMessage(files: File[]): string {
  const onlyCompanions = files.length > 0 && files.every((file) => isModelCompanionFilename(file.name));
  if (onlyCompanions) return "Select the model file (.obj, .gltf…) together with its materials and textures.";
  return `Supports ${SUPPORTED_FORMATS_LABEL}.`;
}
