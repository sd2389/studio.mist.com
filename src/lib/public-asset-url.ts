import { getPublicApiUrl } from "@/lib/api-url";

function encodeKeyPath(key: string): string {
  return key
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

/** Resolve a storage key or relative path to a browser-loadable URL. */
export function resolvePublicAssetUrl(keyOrUrl: string): string {
  const trimmed = keyOrUrl.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;

  const key = trimmed.replace(/^\/+/, "");
  const cdn = process.env.NEXT_PUBLIC_CDN_ORIGIN?.trim();
  if (cdn) {
    return `${cdn.replace(/\/+$/, "")}/${encodeKeyPath(key)}`;
  }

  const api = getPublicApiUrl();
  if (api) {
    return `${api}/files/${encodeKeyPath(key)}`;
  }

  return `/${key}`;
}

/** Catalog HDRIs/backgrounds may be served from a dedicated static origin. */
export function resolveSourceAssetUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;

  const assetOrigin = process.env.NEXT_PUBLIC_SOURCE_ASSET_ORIGIN?.trim();
  if (assetOrigin) {
    const path = trimmed.replace(/^\/+/, "");
    return `${assetOrigin.replace(/\/+$/, "")}/${encodeKeyPath(path)}`;
  }

  return resolvePublicAssetUrl(trimmed);
}
