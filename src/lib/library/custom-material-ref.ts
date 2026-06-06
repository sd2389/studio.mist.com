import type { CatalogMaterialRef } from "@/lib/catalog/catalog-material-ref";
import type { MaterialPresetId } from "@/stores/material-preset-store";

export type CustomMaterialRef = `custom:${number}`;

export type SlotMaterialRef = MaterialPresetId | CustomMaterialRef | CatalogMaterialRef;

export function customMaterialRef(id: number): CustomMaterialRef {
  return `custom:${id}`;
}

export function isCustomMaterialRef(value: string): value is CustomMaterialRef {
  return /^custom:\d+$/.test(value);
}

export function parseCustomMaterialId(value: string): number | null {
  const match = value.match(/^custom:(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function asSlotMaterialRef(value: string): SlotMaterialRef {
  return value as SlotMaterialRef;
}
