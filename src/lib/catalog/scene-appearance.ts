import type { CSSProperties } from "react";
import type { BackgroundItem, EnvironmentItem, GroundItem } from "@/lib/catalog/types";
import { resolveSourceAssetUrl } from "@/lib/source-catalog";

type GradientStop = { offset: number; color: string };

function normalizeStops(raw: unknown): GradientStop[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const offset = Number((entry as { offset?: unknown }).offset);
      const color = (entry as { color?: unknown }).color;
      if (!Number.isFinite(offset) || typeof color !== "string") return null;
      return { offset, color };
    })
    .filter((stop): stop is GradientStop => stop !== null);
}

export function resolveEnvironmentUrl(item: EnvironmentItem | null, fallback: string): string {
  if (!item) return fallback;
  const candidate = item.master_url || item.preview_url || item.swatch_url || "";
  if (!candidate) return fallback;
  return resolveSourceAssetUrl(candidate);
}

export function environmentPreviewUrl(item: EnvironmentItem): string | null {
  return item.preview_url || item.swatch_url || item.master_url;
}

export type GroundRenderParams = {
  enabled: boolean;
  opacity: number;
  blur: number;
  reflection: number;
};

export function groundParamsFromItem(item: GroundItem | null): GroundRenderParams {
  if (!item) {
    return { enabled: true, opacity: 0.24, blur: 2.5, reflection: 0 };
  }
  const params = item.params;
  if (params.kind === "none") {
    return { enabled: false, opacity: 0, blur: 0, reflection: 0 };
  }
  const opacity = typeof params.shadowOpacity === "number" ? params.shadowOpacity : 0.24;
  const blur = typeof params.shadowBlur === "number" ? params.shadowBlur * 3 : 2.5;
  const reflection =
    typeof params.reflectionStrength === "number" ? params.reflectionStrength : 0;
  return { enabled: true, opacity, blur, reflection };
}

export function backgroundStyleFromSelection(
  item: BackgroundItem | null,
  customBackground: string | null | undefined,
  fallbackColor: string,
): CSSProperties {
  if (customBackground) {
    return {
      backgroundImage: `url("${customBackground}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (!item) {
    return { backgroundColor: fallbackColor };
  }
  const params = item.params;
  if (params.kind === "none" || item.is_transparent) {
    return { backgroundColor: "transparent" };
  }
  if (params.kind === "solid" && typeof params.color === "string") {
    return { backgroundColor: params.color };
  }
  if (params.kind === "linear") {
    const angle = typeof params.angle === "number" ? params.angle : 180;
    const stops = normalizeStops(params.stops);
    if (stops.length >= 2) {
      const gradient = stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ");
      return { backgroundImage: `linear-gradient(${angle}deg, ${gradient})` };
    }
  }
  if (params.kind === "radial") {
    const stops = normalizeStops(params.stops);
    if (stops.length >= 2) {
      const gradient = stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ");
      return { backgroundImage: `radial-gradient(circle at center, ${gradient})` };
    }
  }
  return { backgroundColor: fallbackColor };
}

export function backgroundColorForCanvas(
  item: BackgroundItem | null,
  customBackground: string | null | undefined,
  fallbackColor: string,
): string | null {
  if (customBackground) return null;
  if (!item) return fallbackColor;
  const params = item.params;
  if (params.kind === "none" || item.is_transparent) return null;
  if (params.kind === "solid" && typeof params.color === "string") return params.color;
  return null;
}
