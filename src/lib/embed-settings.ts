export type EmbedSettings = {
  showChrome?: boolean;
  autoRotate?: boolean;
  showTitle?: boolean;
  brandingText?: string | null;
  showZoomControls?: boolean;
  showStudioLink?: boolean;
};

export const DEFAULT_EMBED_SETTINGS: Required<EmbedSettings> = {
  showChrome: true,
  autoRotate: true,
  showTitle: true,
  brandingText: null,
  showZoomControls: true,
  showStudioLink: false,
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Per-page overrides added to an embed link by hand (`?chrome=0`, `?branding=Acme`). */
export function parseEmbedUrlParams(
  params: Record<string, string | string[] | undefined>,
): Partial<EmbedSettings> {
  const patch: Partial<EmbedSettings> = {};
  const chrome = firstParam(params.chrome);
  if (chrome !== undefined) patch.showChrome = parseBool(chrome, true);
  const autorotate = firstParam(params.autorotate);
  if (autorotate !== undefined) patch.autoRotate = parseBool(autorotate, true);
  const title = firstParam(params.title);
  if (title !== undefined) patch.showTitle = parseBool(title, true);
  const zoom = firstParam(params.zoom);
  if (zoom !== undefined) patch.showZoomControls = parseBool(zoom, true);
  const studio = firstParam(params.studio);
  if (studio !== undefined) patch.showStudioLink = parseBool(studio, true);
  const branding = firstParam(params.branding);
  if (branding !== undefined) patch.brandingText = branding.trim() || null;
  return patch;
}

export function resolveEmbedSettings(
  stored?: EmbedSettings | null,
  urlPatch?: Partial<EmbedSettings>,
): Required<EmbedSettings> {
  return {
    ...DEFAULT_EMBED_SETTINGS,
    ...stored,
    ...urlPatch,
  };
}

export function resolveEmbedKey(sku: string | null | undefined, viewerId: string): string {
  const trimmedSku = sku?.trim();
  return trimmedSku || viewerId;
}

/**
 * The one link to a piece's embed. It names the piece and nothing else: the look and the
 * viewer options are read from the saved scene on every load, so a snippet already on a
 * store page shows the jeweler's later changes.
 */
export function buildEmbedUrl(origin: string, embedKey: string): string {
  return `${origin.replace(/\/$/, "")}/embed/${encodeURIComponent(embedKey)}`;
}

export function buildEmbedIframeSnippet(
  embedUrl: string,
  opts: { width?: number; height?: number; title?: string } = {},
): string {
  const width = opts.width ?? 800;
  const height = opts.height ?? 640;
  const title = opts.title ?? "MIST 3D";
  return `<iframe\n  src="${embedUrl}"\n  width="${width}"\n  height="${height}"\n  style="border:0;border-radius:12px;max-width:100%"\n  loading="lazy"\n  title="${title}"\n  allowfullscreen\n></iframe>`;
}
