/** Helpers for displaying catalog swatch thumbnails in the UI. */

import type { CatalogItem, GemItem, MetalItem } from "@/lib/catalog/types";

export function catalogSwatchImageUrl(item: CatalogItem): string | null {
  return item.swatch_url;
}

export function catalogFallbackColor(item: CatalogItem): string {
  const params = item.params;
  if ("baseColor" in params && typeof params.baseColor === "string") {
    return params.baseColor;
  }
  if ("color" in params && typeof params.color === "string") {
    return params.color;
  }
  if (params.kind === "linear" || params.kind === "radial") {
    const stops = params.stops;
    if (Array.isArray(stops) && stops[0] && typeof stops[0].color === "string") {
      return stops[0].color;
    }
  }
  return "#9CA3AF";
}

export function isGemCatalogItem(item: CatalogItem): item is GemItem {
  return "gem_family" in item;
}

export function isMetalCatalogItem(item: CatalogItem): item is MetalItem {
  return "category" in item;
}
