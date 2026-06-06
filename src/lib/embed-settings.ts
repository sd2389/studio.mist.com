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
  showStudioLink: true,
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

export function embedSettingsToQuery(settings: EmbedSettings): string {
  const params = new URLSearchParams();
  if (settings.showChrome === false) params.set("chrome", "0");
  if (settings.autoRotate === false) params.set("autorotate", "0");
  if (settings.showTitle === false) params.set("title", "0");
  if (settings.showZoomControls === false) params.set("zoom", "0");
  if (settings.showStudioLink === false) params.set("studio", "0");
  if (settings.brandingText) params.set("branding", settings.brandingText);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function resolveEmbedKey(sku: string | null | undefined, viewerId: string): string {
  const trimmedSku = sku?.trim();
  return trimmedSku || viewerId;
}

export function buildEmbedUrl(
  origin: string,
  embedKey: string,
  settings?: EmbedSettings,
): string {
  const base = `${origin.replace(/\/$/, "")}/embed/${encodeURIComponent(embedKey)}`;
  if (!settings) return base;
  return `${base}${embedSettingsToQuery(settings)}`;
}

export function buildEmbedIframeSnippet(
  embedUrl: string,
  opts: { width?: number; height?: number; title?: string } = {},
): string {
  const width = opts.width ?? 800;
  const height = opts.height ?? 640;
  const title = opts.title ?? "DevJewels 3D";
  return `<iframe\n  src="${embedUrl}"\n  width="${width}"\n  height="${height}"\n  style="border:0;border-radius:12px;max-width:100%"\n  loading="lazy"\n  title="${title}"\n  allowfullscreen\n></iframe>`;
}
