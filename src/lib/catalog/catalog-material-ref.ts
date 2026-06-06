import type { MaterialPresetId } from "@/stores/material-preset-store";

export type CatalogMaterialRef = `catalog:${string}`;

export function catalogMaterialRef(slug: string): CatalogMaterialRef {
  return `catalog:${slug}`;
}

export function isCatalogMaterialRef(value: string): value is CatalogMaterialRef {
  return value.startsWith("catalog:");
}

export function parseCatalogMaterialSlug(value: string): string | null {
  if (!isCatalogMaterialRef(value)) return null;
  const slug = value.slice("catalog:".length).trim();
  return slug || null;
}

export function asCatalogOrPreset(value: string): MaterialPresetId | CatalogMaterialRef {
  return value as MaterialPresetId | CatalogMaterialRef;
}
