/**
 * What sits behind a render when it is flattened (JPEG, MP4, opaque PNG).
 *
 * Gradient and image backgrounds are CSS behind a transparent canvas (ViewportBackground),
 * so a raw readback has alpha 0 there — which encoders flatten to black. Exports paint one
 * of these backdrops first and draw the render on top.
 */

export type BackdropStop = { offset: number; color: string };

export type ExportBackdrop =
  | { kind: "color"; color: string }
  | { kind: "linear-gradient"; angleDeg: number; stops: BackdropStop[] }
  | { kind: "radial-gradient"; stops: BackdropStop[] }
  | { kind: "image"; url: string; fallbackColor: string };

export const WHITE_BACKDROP: ExportBackdrop = { kind: "color", color: "#ffffff" };

type Paint2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Split on commas that are not nested inside parentheses. */
export function splitTopLevel(value: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function isTransparentCssColor(color: string | null | undefined): boolean {
  if (!color) return true;
  const value = color.trim().toLowerCase();
  if (value === "transparent" || value === "none" || value === "") return true;
  const alpha = value.match(/^rgba?\((.+)\)$/)?.[1]?.split(/[\s,/]+/).filter(Boolean)[3];
  return alpha !== undefined && Number.parseFloat(alpha) === 0;
}

const SIDE_ANGLES: Record<string, number> = {
  "to top": 0,
  "to right": 90,
  "to bottom": 180,
  "to left": 270,
  "to top right": 45,
  "to right top": 45,
  "to bottom right": 135,
  "to right bottom": 135,
  "to bottom left": 225,
  "to left bottom": 225,
  "to top left": 315,
  "to left top": 315,
};

function parseAngle(token: string): number | null {
  const side = SIDE_ANGLES[token.trim().toLowerCase().replace(/\s+/g, " ")];
  if (side !== undefined) return side;
  const match = token.trim().match(/^(-?[\d.]+)(deg|turn|rad|grad)$/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!);
  const unit = match[2]!.toLowerCase();
  if (unit === "turn") return value * 360;
  if (unit === "rad") return (value * 180) / Math.PI;
  if (unit === "grad") return value * 0.9;
  return value;
}

function parseStop(token: string): { color: string; offset: number | null } {
  // "rgb(1, 2, 3) 40%" → colour + first position; double positions keep the first.
  const match = token.match(/^(.*?)(?:\s+(-?[\d.]+)%)?(?:\s+-?[\d.]+%)?$/);
  const color = (match?.[1] ?? token).trim();
  const offset = match?.[2] !== undefined ? Number.parseFloat(match[2]) / 100 : null;
  return { color, offset };
}

function distributeStops(raw: { color: string; offset: number | null }[]): BackdropStop[] {
  const last = Math.max(1, raw.length - 1);
  return raw.map((stop, index) => ({
    color: stop.color,
    offset: Math.min(1, Math.max(0, stop.offset ?? index / last)),
  }));
}

function parseGradient(kind: "linear" | "radial", args: string): ExportBackdrop | null {
  const parts = splitTopLevel(args);
  let angleDeg = 180;
  if (kind === "linear") {
    const angle = parts[0] ? parseAngle(parts[0]) : null;
    if (angle !== null) {
      angleDeg = angle;
      parts.shift();
    }
  } else if (parts[0] && /^(circle|ellipse|closest|farthest|at\s)/i.test(parts[0])) {
    parts.shift();
  }
  const stops = distributeStops(parts.map(parseStop));
  if (stops.length < 2) return null;
  return kind === "linear"
    ? { kind: "linear-gradient", angleDeg, stops }
    : { kind: "radial-gradient", stops };
}

/** Turn computed `background-image` / `background-color` into a paintable backdrop. */
export function parseCssBackdrop(
  backgroundImage: string | null | undefined,
  backgroundColor: string | null | undefined,
): ExportBackdrop | null {
  const color = isTransparentCssColor(backgroundColor) ? null : backgroundColor!.trim();
  const layer = backgroundImage && backgroundImage !== "none" ? splitTopLevel(backgroundImage)[0] : null;
  const fn = layer?.match(/^(repeating-)?(linear|radial)-gradient\((.*)\)$/i);
  if (fn && !fn[1]) {
    const gradient = parseGradient(fn[2]!.toLowerCase() as "linear" | "radial", fn[3]!);
    if (gradient) return gradient;
  }
  const url = layer?.match(/^url\(\s*(['"]?)(.*?)\1\s*\)$/i)?.[2];
  if (url) return { kind: "image", url, fallbackColor: color ?? "#ffffff" };
  return color ? { kind: "color", color } : null;
}

/** CSS gradient line for a `width × height` box (the spec's "gradient line length"). */
export function linearGradientLine(width: number, height: number, angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

/** `object-fit: cover`, centred. */
export function coverRect(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

function fillGradient(ctx: Paint2D, width: number, height: number, backdrop: ExportBackdrop): void {
  if (backdrop.kind !== "linear-gradient" && backdrop.kind !== "radial-gradient") return;
  let gradient: CanvasGradient;
  if (backdrop.kind === "linear-gradient") {
    const line = linearGradientLine(width, height, backdrop.angleDeg);
    gradient = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
  } else {
    // `circle at center` defaults to farthest-corner.
    const radius = Math.hypot(width / 2, height / 2);
    gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, radius);
  }
  for (const stop of backdrop.stops) {
    try {
      gradient.addColorStop(stop.offset, stop.color);
    } catch {
      // Unparseable colour in this browser — skip the stop rather than fail the export.
    }
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function paintBackdrop(
  ctx: Paint2D,
  width: number,
  height: number,
  backdrop: ExportBackdrop,
  image: CanvasImageSource | null = null,
): void {
  if (backdrop.kind === "color") {
    ctx.fillStyle = backdrop.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (backdrop.kind === "image") {
    ctx.fillStyle = backdrop.fallbackColor;
    ctx.fillRect(0, 0, width, height);
    const size = image ? imageSize(image) : null;
    if (image && size) {
      const rect = coverRect(size.width, size.height, width, height);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    }
    return;
  }
  fillGradient(ctx, width, height, backdrop);
}

function imageSize(image: CanvasImageSource): { width: number; height: number } | null {
  const candidate = image as { width?: unknown; height?: unknown; naturalWidth?: unknown; naturalHeight?: unknown };
  const width = Number(candidate.naturalWidth ?? candidate.width);
  const height = Number(candidate.naturalHeight ?? candidate.height);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Fetches an image backdrop; null (→ fallback colour) when CORS or decoding fails. */
export async function loadBackdropImage(backdrop: ExportBackdrop | null): Promise<ImageBitmap | null> {
  if (backdrop?.kind !== "image" || typeof createImageBitmap === "undefined") return null;
  try {
    const response = await fetch(backdrop.url, { mode: "cors" });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

function backdropFromElement(element: Element, requirePositioned: boolean): ExportBackdrop | null {
  const style = getComputedStyle(element);
  if (requirePositioned && style.position !== "absolute" && style.position !== "fixed") return null;
  return parseCssBackdrop(style.backgroundImage, style.backgroundColor);
}

/**
 * Reads what the user actually sees behind the live canvas: positioned layers painted
 * before it (ViewportBackground) or the nearest ancestor with a background.
 */
export function readViewportBackdrop(canvas: Element | null | undefined, maxDepth = 8): ExportBackdrop | null {
  if (typeof window === "undefined" || !canvas) return null;
  let node: Element = canvas;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parent = node.parentElement;
    if (!parent) return null;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node) break;
      const behind = backdropFromElement(sibling, true);
      if (behind) return behind;
    }
    const own = backdropFromElement(parent, false);
    if (own) return own;
    node = parent;
  }
  return null;
}
