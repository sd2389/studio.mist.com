/**
 * Jewelry model formats the upload flow can parse (extension lower-case, no dot) — the single
 * frontend source of truth; `backend/app/features/upload/service.py` mirrors it. Everything is
 * converted to GLB in the browser before storage, so stored keys are `.glb` (plus legacy
 * `.gltf`, `.stl`, `.3dm` scenes).
 */
export const SUPPORTED_MODEL_EXTS = [
  "glb",
  "gltf",
  "3dm",
  "step",
  "stp",
  "iges",
  "igs",
  "obj",
  "fbx",
  "stl",
  "ply",
  "3mf",
] as const;
export type ModelExt = (typeof SUPPORTED_MODEL_EXTS)[number];

/** Files that may accompany a model: OBJ materials and textures, a .gltf's external buffers. */
export const MODEL_COMPANION_EXTS = ["mtl", "bin", "png", "jpg", "jpeg", "webp", "gif", "bmp"] as const;

const EXT_RE = new RegExp(`\\.(${SUPPORTED_MODEL_EXTS.join("|")})$`, "i");

/** Derive viewer route id from stored model key. Keeps extension. */
export function viewerIdFromModelKey(key: string): string {
  const trimmed = key.replace(/^\/+/, "");
  const customerMatch = trimmed.match(/^customers\/\d+\/models\/(.+)$/);
  if (customerMatch) return customerMatch[1];
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}

/** Sniff extension from a URL or filename. Returns null if unsupported.
 *  Ignores query strings and hash fragments (presigned S3/R2 URLs carry both).
 */
export function modelExtFromUrl(url: string): ModelExt | null {
  const path = url.split(/[?#]/, 1)[0];
  const m = path.match(EXT_RE);
  return m ? (m[1].toLowerCase() as ModelExt) : null;
}

/** Supported model extension of an uploaded file's name, or null. */
export function modelExtFromFilename(filename: string): ModelExt | null {
  const m = filename.trim().match(EXT_RE);
  return m ? (m[1].toLowerCase() as ModelExt) : null;
}

export function isSupportedModelFilename(filename: string): boolean {
  return modelExtFromFilename(filename) !== null;
}

export function isModelCompanionFilename(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").at(-1) ?? "";
  return (MODEL_COMPANION_EXTS as readonly string[]).includes(ext) && filename.includes(".");
}
