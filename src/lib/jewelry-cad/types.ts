import type * as THREE from "three";
import type { CadCutId } from "@/lib/stones/cad-cuts";
import type { ShankProfileId } from "@/lib/jewelry-cad/parts/shank-profile";
import type { CadGemId } from "@/lib/jewelry-cad/stones/gem-types";
import type { CadMetalId } from "@/lib/jewelry-cad/units/metals";

export type { CadCutId, CadGemId, CadMetalId, ShankProfileId };

export type PieceKind = "ring" | "studs" | "pendant";
export type HeadStyle = "4-prong" | "6-prong" | "basket" | "bezel";
export type HaloStyle = "none" | "halo" | "hidden";
export type BandStones = "none" | "pave" | "channel" | "eternity-full" | "eternity-half";

/**
 * Everything that defines a piece. Plain data (safe to serialise, post to a worker, or
 * put in a URL); `buildJewelry` turns it into geometry. Lengths are millimetres.
 */
export type JewelryDesign = {
  kind: PieceKind;
  /** Rings only: false for plain and eternity bands. */
  centerStone: boolean;
  /** Rings only: a side stone either side of the center (three-stone). */
  sideStones: boolean;
  bandStones: BandStones;
  cut: CadCutId;
  /** Center stone weight. */
  carat: number;
  gem: CadGemId;
  /** Side stones, halo and band stones. */
  accentGem: CadGemId;
  metal: CadMetalId;
  /** Metal for the head and prongs; "match" uses `metal` (two-tone otherwise). */
  headMetal: CadMetalId | "match";
  head: HeadStyle;
  halo: HaloStyle;
  profile: ShankProfileId;
  bandWidth: number;
  bandThickness: number;
  /** 0..0.6: how much the band narrows toward the head. */
  taper: number;
  cathedral: boolean;
  /** US ring size, 3–13 in quarter steps. */
  ringSize: number;
};

/** Mesh names follow `detect-slots.ts`: they survive a GLB round-trip into the studio. */
export type SlotName = "Metal 1" | "Heads" | "Gem 1" | "Accent 1" | "Accent 2" | "Accent 3";
export type JewelryRole = "metal" | "gem" | "accent-gem";

export type BuiltPart = {
  slot: SlotName;
  role: JewelryRole;
  /** Metal: indexed + smooth normals. Stones: non-indexed, flat facets, one island each. */
  geometry: THREE.BufferGeometry;
  metal?: CadMetalId;
  gem?: CadGemId;
};

export type StoneGroupSpec = {
  slot: SlotName;
  label: string;
  cut: CadCutId;
  gem: CadGemId;
  count: number;
  caratEach: number;
  lengthMm: number;
  widthMm: number;
  depthMm: number;
};

export type MetalSpec = {
  slot: SlotName;
  metal: CadMetalId;
  volumeMm3: number;
  grams: number;
};

export type JewelrySpecs = {
  metals: MetalSpec[];
  metalVolumeMm3: number;
  metalGrams: number;
  /** The whole piece cast in each alloy (for comparing metals). */
  weightsByMetal: Array<{ metal: CadMetalId; grams: number }>;
  stones: StoneGroupSpec[];
  stoneCount: number;
  totalCarat: number;
  /** Overall bounding box, mm (x across the ring, y up, z along the finger). */
  sizeMm: { x: number; y: number; z: number };
  ring?: {
    usSize: number;
    innerDiameterMm: number;
    circumferenceMm: number;
    eu: number;
    bandWidthMm: number;
    bandThicknessMm: number;
    /** Table height above the finger (top of the inside of the band). */
    settingHeightMm: number;
  };
};

/** Where a prong grips a stone, in piece coordinates — used by tests and QA overlays. */
export type ProngContact = {
  girdlePoint: THREE.Vector3;
  path: THREE.Vector3[];
  radius: number;
  tipCenter: THREE.Vector3;
  tipRadius: number;
};

export type BuiltJewelry = {
  design: JewelryDesign;
  parts: BuiltPart[];
  specs: JewelrySpecs;
  prongs: ProngContact[];
};
