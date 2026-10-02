import type { MaterialPresetId } from "@/stores/material-preset-store";
import type {
  BuiltInAngleId,
  CampaignPackConfig,
  PackMetalId,
  TurntableFormatId,
} from "./types";

export type PackMetalOption = {
  id: PackMetalId;
  label: string;
  group: "yellow" | "white" | "rose" | "speciality" | "current";
};

/** Every metal preset the studio ships, plus the as-configured look. */
export const PACK_METAL_OPTIONS = [
  { id: "gold-18k-yellow", label: "18K Yellow Gold", group: "yellow" },
  { id: "gold-24k", label: "24K Gold", group: "yellow" },
  { id: "gold-22k", label: "22K Gold", group: "yellow" },
  { id: "gold-14k-yellow", label: "14K Yellow Gold", group: "yellow" },
  { id: "gold-10k-yellow", label: "10K Yellow Gold", group: "yellow" },
  { id: "gold-9k-yellow", label: "9K Yellow Gold", group: "yellow" },
  { id: "gold-18k-white", label: "18K White Gold", group: "white" },
  { id: "gold-14k-white", label: "14K White Gold", group: "white" },
  { id: "gold-10k-white", label: "10K White Gold", group: "white" },
  { id: "platinum", label: "Platinum", group: "white" },
  { id: "silver-sterling", label: "Sterling Silver", group: "white" },
  { id: "titanium", label: "Titanium", group: "white" },
  { id: "rhodium-black", label: "Black Rhodium", group: "white" },
  { id: "gold-18k-rose", label: "18K Rose Gold", group: "rose" },
  { id: "gold-14k-rose", label: "14K Rose Gold", group: "rose" },
  { id: "gold-red-light", label: "Light Red Gold", group: "rose" },
  { id: "gold-red", label: "Red Gold", group: "rose" },
  { id: "gold-warm", label: "Warm Gold", group: "speciality" },
  { id: "gold-sand", label: "Sand Gold", group: "speciality" },
  { id: "gold-green", label: "Green Gold", group: "speciality" },
  { id: "gold-grey", label: "Grey Gold", group: "speciality" },
  { id: "current", label: "As configured", group: "current" },
] as const satisfies readonly PackMetalOption[];

export type PackMetalPresetId = Exclude<(typeof PACK_METAL_OPTIONS)[number]["id"], "current">;

export function isPackMetalPreset(id: PackMetalId): id is PackMetalPresetId & MaterialPresetId {
  return id !== "current" && PACK_METAL_OPTIONS.some((option) => option.id === id);
}

export function packMetalLabel(id: PackMetalId): string {
  return PACK_METAL_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

export const BUILT_IN_ANGLES: readonly {
  id: BuiltInAngleId;
  label: string;
  azimuthDeg: number;
  elevationDeg: number;
}[] = [
  { id: "front", label: "Front", azimuthDeg: 0, elevationDeg: 6 },
  { id: "three-quarter", label: "Three-quarter hero", azimuthDeg: 35, elevationDeg: 24 },
  { id: "top", label: "Top", azimuthDeg: 0, elevationDeg: 90 },
  { id: "side", label: "Side", azimuthDeg: 90, elevationDeg: 6 },
];

export const PACK_STILL_SIZES = [1000, 2000, 3000, 4000] as const;

export const TURNTABLE_FORMATS: Record<
  TurntableFormatId,
  { width: number; height: number; label: string; hint: string }
> = {
  landscape: { width: 1920, height: 1080, label: "16:9 · 1920×1080", hint: "Web, YouTube, PDP" },
  square: { width: 1080, height: 1080, label: "1:1 · 1080×1080", hint: "Instagram feed, marketplaces" },
  vertical: { width: 1080, height: 1920, label: "9:16 · 1080×1920", hint: "Reels, TikTok, Shorts" },
};

export const TURNTABLE_FORMAT_ORDER: TurntableFormatId[] = ["landscape", "square", "vertical"];

/** Vertical field of view for auto-framed shots: a mild telephoto keeps rings undistorted. */
export const PACK_LENS_FOV_DEG = 30;
/** Where orbits (turntables, 360° spins) start, and their camera height. */
export const PACK_ORBIT_AZIMUTH_DEG = 35;
export const PACK_ORBIT_ELEVATION_DEG = 20;

export const DEFAULT_CAMPAIGN_PACK_CONFIG: CampaignPackConfig = {
  metals: ["gold-18k-yellow", "gold-18k-white", "gold-18k-rose"],
  angleIds: BUILT_IN_ANGLES.map((angle) => angle.id),
  stillSize: 2000,
  formats: { jpg: true, png: true },
  background: { kind: "white" },
  jpegQuality: 0.95,
  autoFrame: true,
  marginPct: 8,
  contactShadow: true,
  turntable: { enabled: true, formats: ["landscape", "square"], durationSec: 10, fps: 30 },
  spin: { enabled: true, frames: 72, size: 1080 },
  embed: true,
  cutScope: true,
};

/** ASET legend, as gem labs print it next to the image. */
export const ASET_LEGEND =
  "red = bright light from 45–75°, green = low-angle light, blue = viewer obstruction (contrast), white/black = light leakage";
