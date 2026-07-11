import { Camera, Moon, Sparkles, Sun, SunDim, type LucideIcon } from "lucide-react";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import type { SceneSettingBucketKey } from "@/lib/slot-materials/model-config";
import {
  mapSourceGemToPreset,
  mapSourceMetalToPreset,
  type SourceCatalogItem,
} from "@/lib/source-catalog";
import type { FinishId, LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";

export type MaterialEntry = { id: MaterialPresetId; label: string };
export type MaterialGroup = { title: string; tagline?: string; items: MaterialEntry[] };
export type SlotId = string;

export const SCENE_BUCKET_ORDER: SceneSettingBucketKey[] = [
  "ENVIRONMENT-METAL",
  "ENVIRONMENT-GEM",
  "GROUND",
  "BACKGROUND",
  "VJSON",
];

export const MATERIAL_GROUPS: MaterialGroup[] = [
  {
    title: "Yellow Golds",
    tagline: "24K → 9K",
    items: [
      { id: "gold-24k", label: "24K" },
      { id: "gold-22k", label: "22K" },
      { id: "gold-18k-yellow", label: "18K" },
      { id: "gold-14k-yellow", label: "14K" },
      { id: "gold-10k-yellow", label: "10K" },
      { id: "gold-9k-yellow", label: "9K" },
    ],
  },
  {
    title: "White Metals",
    items: [
      { id: "gold-18k-white", label: "18K White" },
      { id: "gold-14k-white", label: "14K White" },
      { id: "gold-10k-white", label: "10K White" },
      { id: "platinum", label: "Platinum" },
      { id: "silver-sterling", label: "Sterling" },
      { id: "titanium", label: "Titanium" },
      { id: "rhodium-black", label: "Black Rhodium" },
    ],
  },
  {
    title: "Rose & Red Golds",
    tagline: "Cu-alloyed",
    items: [
      { id: "gold-18k-rose", label: "18K Rose" },
      { id: "gold-14k-rose", label: "14K Rose" },
      { id: "gold-red-light", label: "Light Red" },
      { id: "gold-red", label: "Red" },
    ],
  },
  {
    title: "Speciality Golds",
    tagline: "Ag / Pd alloys",
    items: [
      { id: "gold-warm", label: "Warm" },
      { id: "gold-sand", label: "Sand" },
      { id: "gold-green", label: "Green" },
      { id: "gold-grey", label: "Grey" },
    ],
  },
  {
    title: "Diamond Family",
    tagline: "D-colour & fancies",
    items: [
      { id: "diamond", label: "D Colour" },
      { id: "diamond-canary", label: "Canary" },
      { id: "diamond-pink", label: "Pink" },
      { id: "diamond-blue", label: "Blue" },
      { id: "diamond-champagne", label: "Champagne" },
      { id: "diamond-cognac", label: "Cognac" },
      { id: "diamond-black", label: "Black" },
      { id: "moissanite", label: "Moissanite" },
      { id: "zircon", label: "Zircon" },
    ],
  },
  {
    title: "Coloured Gems",
    items: [
      { id: "ruby", label: "Ruby" },
      { id: "sapphire", label: "Sapphire" },
      { id: "emerald", label: "Emerald" },
      { id: "spinel", label: "Spinel" },
      { id: "tanzanite", label: "Tanzanite" },
      { id: "garnet-tsavorite", label: "Tsavorite" },
      { id: "garnet-almandine", label: "Garnet" },
      { id: "peridot", label: "Peridot" },
      { id: "topaz-blue", label: "Blue Topaz" },
      { id: "tourmaline", label: "Tourmaline" },
      { id: "aquamarine", label: "Aquamarine" },
      { id: "morganite", label: "Morganite" },
      { id: "amethyst", label: "Amethyst" },
      { id: "citrine", label: "Citrine" },
    ],
  },
  {
    title: "Specialty",
    tagline: "Iridescent & translucent",
    items: [
      { id: "opal", label: "Opal" },
      { id: "jade", label: "Jade" },
      { id: "pearl", label: "Pearl" },
    ],
  },
];

const ALL_ENTRIES: { entry: MaterialEntry; groupTitle: string }[] = MATERIAL_GROUPS.flatMap((g) =>
  g.items.map((entry) => ({ entry, groupTitle: g.title })),
);

export const LIGHTING: { id: LightingPresetId; label: string; icon: LucideIcon }[] = [
  { id: "studio", label: "Studio", icon: Sun },
  { id: "soft", label: "Soft", icon: SunDim },
  { id: "dark", label: "Low key", icon: Moon },
  { id: "catalog", label: "Catalog", icon: Camera },
  { id: "dramatic", label: "Dramatic", icon: Sparkles },
];

export const FINISHES: { id: FinishId; label: string; hint: string }[] = [
  { id: "polished", label: "Polished", hint: "Mirror" },
  { id: "satin", label: "Satin", hint: "Soft matte" },
  { id: "brushed", label: "Brushed", hint: "Directional grain" },
  { id: "sandblasted", label: "Sandblasted", hint: "Frosted" },
  { id: "hammered", label: "Hammered", hint: "Domed dimples" },
];

export function prettyName(id: MaterialPresetId): string {
  if (id === "original") return "Original";
  const match = ALL_ENTRIES.find((x) => x.entry.id === id);
  if (!match) return id;
  return match.entry.label;
}

export function groupOf(id: MaterialPresetId): string {
  if (id === "original") return "As uploaded";
  return ALL_ENTRIES.find((x) => x.entry.id === id)?.groupTitle ?? "";
}

export function slotKind(slot: SlotId): "metal" | "gem" {
  return slot.startsWith("Gem") || slot.startsWith("Accent") ? "gem" : "metal";
}

export function isGenericGemToken(token: string): boolean {
  return /^(gem|stone|diamond)(\s*0*[1-9]\d*)?$/i.test(token.trim());
}

export function resolveGroupedPreset(
  slots: string[],
  selections: Record<string, SlotMaterialRef>,
): SlotMaterialRef | undefined {
  for (const slot of slots) {
    const selected = selections[slot];
    if (selected) return selected;
  }
  return undefined;
}

export function buildSlotBadge(slot: string, groupedCount: number): string {
  if (/^heads$/i.test(slot)) return groupedCount > 1 ? `H × ${groupedCount}` : "H";
  const number = slot.match(/\d+/)?.[0];
  if (!number) return groupedCount > 1 ? `${slot} × ${groupedCount}` : slot;
  return groupedCount > 1 ? `#${number} × ${groupedCount}` : `#${number}`;
}

export function mapCatalogItemToPreset(item: SourceCatalogItem, slot: SlotId): MaterialPresetId {
  return slotKind(slot) === "gem" ? mapSourceGemToPreset(item) : mapSourceMetalToPreset(item);
}
