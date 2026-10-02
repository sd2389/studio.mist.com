import {
  clampUsSize,
  getPreset,
  type BandStones,
  type HaloStyle,
  type HeadStyle,
  type JewelryDesign,
  type PresetId,
  type ShankProfileId,
} from "@/lib/jewelry-cad";

/**
 * Rules that keep a design coherent as the customer changes one option at a time, plus
 * the small derived facts the UI needs (what applies to this piece, what to call it).
 */

export const CARAT_MIN = 0.25;
export const CARAT_MAX = 5;
export const BAND_WIDTH_MIN = 1.5;
export const BAND_WIDTH_MAX = 8;
export const BAND_THICKNESS_MIN = 1.2;
export const BAND_THICKNESS_MAX = 3;
export const TAPER_MAX = 0.5;

export type DesignPatch = Partial<JewelryDesign>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function isEternity(bandStones: BandStones): boolean {
  return bandStones === "eternity-full" || bandStones === "eternity-half";
}

/** Clamp numbers into range and resolve combinations that cannot be built. */
export function normalizeDesign(design: JewelryDesign): JewelryDesign {
  const next: JewelryDesign = {
    ...design,
    carat: clamp(Math.round(design.carat * 100) / 100, CARAT_MIN, CARAT_MAX),
    bandWidth: clamp(Math.round(design.bandWidth * 10) / 10, BAND_WIDTH_MIN, BAND_WIDTH_MAX),
    bandThickness: clamp(Math.round(design.bandThickness * 10) / 10, BAND_THICKNESS_MIN, BAND_THICKNESS_MAX),
    taper: clamp(design.taper, 0, TAPER_MAX),
    ringSize: clampUsSize(design.ringSize),
  };
  if (next.kind !== "ring") {
    next.sideStones = false;
    next.bandStones = "none";
    next.centerStone = true;
  }
  // An eternity band is its own row of stones; it has no center to set.
  if (isEternity(next.bandStones)) {
    next.centerStone = false;
    next.sideStones = false;
  }
  if (!next.centerStone) {
    next.sideStones = false;
    next.halo = "none";
  }
  if (next.sideStones) next.cathedral = false;
  return next;
}

export function applyPatch(design: JewelryDesign, patch: DesignPatch): JewelryDesign {
  return normalizeDesign({ ...design, ...patch });
}

/** Start from a preset but keep the customer's size and metal where they still apply. */
export function switchPreset(current: JewelryDesign | null, id: PresetId): JewelryDesign {
  const base = getPreset(id).design;
  if (!current) return normalizeDesign(base);
  return normalizeDesign({ ...base, ringSize: current.ringSize });
}

export type DesignCapabilities = {
  isRing: boolean;
  hasCenter: boolean;
  hasSetting: boolean;
  hasHalo: boolean;
  hasBand: boolean;
  hasBandStones: boolean;
  canCathedral: boolean;
  canTaper: boolean;
  hasAccentStones: boolean;
  hasSizes: boolean;
};

/** Which controls mean something for this design. */
export function capabilitiesOf(design: JewelryDesign): DesignCapabilities {
  const isRing = design.kind === "ring";
  const hasCenter = design.centerStone;
  return {
    isRing,
    hasCenter,
    hasSetting: hasCenter,
    hasHalo: hasCenter,
    hasBand: isRing,
    hasBandStones: isRing && hasCenter,
    canCathedral: isRing && hasCenter && !design.sideStones,
    canTaper: isRing && hasCenter,
    hasAccentStones: design.halo !== "none" || design.sideStones || (design.bandStones !== "none" && hasCenter),
    hasSizes: isRing,
  };
}

const HEAD_LABEL: Record<HeadStyle, string> = {
  "4-prong": "four-prong",
  "6-prong": "six-prong",
  basket: "basket",
  bezel: "bezel",
};

const PROFILE_LABEL: Record<ShankProfileId, string> = {
  comfort: "comfort-fit",
  "d-shape": "D-shape",
  flat: "flat",
  "knife-edge": "knife-edge",
};

const HALO_LABEL: Record<HaloStyle, string> = { none: "", halo: "halo", hidden: "hidden halo" };

/** "1.00 ct oval · six-prong · halo" style one-liner for the preview header. */
export function describeDesign(design: JewelryDesign): string {
  if (design.kind === "ring" && !design.centerStone) {
    const stones = isEternity(design.bandStones) ? (design.bandStones === "eternity-full" ? "full eternity" : "half eternity") : "plain";
    return `${design.bandWidth.toFixed(1)} mm ${PROFILE_LABEL[design.profile]} · ${stones}`;
  }
  const parts = [`${design.carat.toFixed(2)} ct ${design.cut}`, HEAD_LABEL[design.head]];
  if (design.halo !== "none") parts.push(HALO_LABEL[design.halo]);
  if (design.sideStones) parts.push("three-stone");
  if (design.bandStones === "pave") parts.push("pavé band");
  if (design.bandStones === "channel") parts.push("channel band");
  return parts.join(" · ");
}

/** File-name stem for downloads, e.g. "mist-halo-oval-1_00ct-us6". */
export function designFileStem(design: JewelryDesign, presetId: PresetId): string {
  const size = design.kind === "ring" ? `-us${String(design.ringSize).replace(".", "_")}` : "";
  const stone = design.centerStone ? `-${design.cut}-${design.carat.toFixed(2).replace(".", "_")}ct` : "";
  return `mist-${presetId}${stone}${size}`;
}

/** Tolerant parse of a design from URL/search params (unknown values fall back to the preset). */
export function designFromParams(params: { preset?: string | null }): { presetId: PresetId; design: JewelryDesign } {
  const preset = getPreset(params.preset ?? null);
  return { presetId: preset.id, design: normalizeDesign(preset.design) };
}

