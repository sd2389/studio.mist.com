/** Supported jewelry model formats (extension lower-case, no dot). */
export const SUPPORTED_MODEL_EXTS = ["glb", "gltf", "stl", "3dm"] as const;
export type ModelExt = (typeof SUPPORTED_MODEL_EXTS)[number];

const EXT_RE = new RegExp(`\\.(${SUPPORTED_MODEL_EXTS.join("|")})$`, "i");

/** Derive viewer route id from stored model key. Keeps extension. */
export function viewerIdFromModelKey(key: string): string {
  const trimmed = key.replace(/^\/+/, "");
  const customerMatch = trimmed.match(/^customers\/\d+\/models\/(.+)$/);
  if (customerMatch) return customerMatch[1];
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}

/** Sniff extension from a URL or filename. Returns null if unsupported. */
export function modelExtFromUrl(url: string): ModelExt | null {
  const m = url.match(EXT_RE);
  return m ? (m[1].toLowerCase() as ModelExt) : null;
}
