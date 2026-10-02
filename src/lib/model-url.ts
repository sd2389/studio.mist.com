import { resolvePublicAssetUrl } from "@/lib/public-asset-url";
import { SUPPORTED_MODEL_EXTS } from "@/lib/model-key";

const EXT_RE = new RegExp(`\\.(${SUPPORTED_MODEL_EXTS.join("|")})$`, "i");

/** The Khronos Clearcoat Ring sample (CC BY 4.0) behind `/viewer/clearcoat`. */
export const CLEARCOAT_MODEL_URL = "/models/clearcoat/ClearcoatRing.gltf";

/** Resolve loader URL from a stored model key (`models/uuid-name.glb`). */
export function resolveModelUrlFromKey(modelKey: string): string {
  const normalized = modelKey.replace(/^\/+/, "");
  if (!normalized) return "";
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
  return resolvePublicAssetUrl(normalized);
}

/** Resolve loader URL from viewer id or full model key. */
export function resolveModelUrl(id: string): string {
  if (id === "mist-solitaire") return "/models/mist-solitaire/ring.glb";
  if (id === "clearcoat") return CLEARCOAT_MODEL_URL;

  const trimmed = id.replace(/^\/+/, "");
  if (trimmed.startsWith("models/")) {
    return resolveModelUrlFromKey(trimmed);
  }

  const hasExt = EXT_RE.test(trimmed);
  const filename = hasExt ? trimmed : `${trimmed}.glb`;
  return resolveModelUrlFromKey(`models/${filename}`);
}
