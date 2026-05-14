import { getPublicApiUrl } from "@/lib/api-url";
import { SUPPORTED_MODEL_EXTS } from "@/lib/model-key";

const EXT_RE = new RegExp(`\\.(${SUPPORTED_MODEL_EXTS.join("|")})$`, "i");

/** Resolve loader URL: static files under `/public` or FastAPI `/files/...` when `NEXT_PUBLIC_API_URL` is set. */
export function resolveModelUrl(id: string): string {
  if (id === "clearcoat") {
    return "/models/clearcoat/ClearcoatRing.gltf";
  }

  const hasExt = EXT_RE.test(id);
  const filename = hasExt ? id : `${id}.glb`;

  const base = getPublicApiUrl();
  if (base) {
    const key = filename.includes("/") ? filename : `models/${filename}`;
    const path = key.split("/").map(encodeURIComponent).join("/");
    return `${base}/files/${path}`;
  }

  return `/models/${filename}`;
}
