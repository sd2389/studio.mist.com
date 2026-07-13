export type FinishSpec =
  | "polished"
  | "brushed"
  | "satin"
  | "hammered"
  | "sandblasted";

export type SettingType =
  | "prong"
  | "bezel"
  | "pave"
  | "channel"
  | "tension"
  | "flush"
  | "other";

export type ShankProfile =
  | "flat"
  | "comfort-fit"
  | "knife-edge"
  | "rounded"
  | "other";

export type HeadStyle =
  | "solitaire"
  | "halo"
  | "three-stone"
  | "cluster"
  | "other";

export type StoneCut =
  | "round"
  | "oval"
  | "cushion"
  | "emerald"
  | "pear"
  | "marquise"
  | "princess"
  | "radiant"
  | "asscher"
  | "heart"
  | "other";

export type ClarityGrade =
  | "FL" | "IF" | "VVS1" | "VVS2" | "VS1" | "VS2" | "SI1" | "SI2" | "I1" | "I2" | "I3";

export type ColorGrade =
  | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M"
  | "fancy";

export type StoneSpec = {
  id: string;
  gem_type: string;
  carat: number | null;
  clarity: ClarityGrade | "" | null;
  color: ColorGrade | "" | null;
  fancy_color: string;
  cut: StoneCut | "" | null;
  quantity: number;
};

export type ProductSpecs = {
  metal_type: string;
  metal_purity: string;
  hallmark: string;
  finish: FinishSpec | "" | null;
  stone_count: number | null;
  total_carat: number | null;
  stones: StoneSpec[];
  setting_type: SettingType | "" | null;
  setting_type_other: string;
  head_style: HeadStyle | "" | null;
  head_style_other: string;
  shank_profile: ShankProfile | "" | null;
  shank_profile_other: string;
  ring_size: string;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  metal_weight_g: number | null;
};

export const FINISH_OPTIONS: { value: FinishSpec; label: string }[] = [
  { value: "polished", label: "Polished" },
  { value: "brushed", label: "Brushed" },
  { value: "satin", label: "Satin" },
  { value: "hammered", label: "Hammered" },
  { value: "sandblasted", label: "Sandblasted" },
];

export const SETTING_TYPE_OPTIONS: { value: SettingType; label: string }[] = [
  { value: "prong", label: "Prong" },
  { value: "bezel", label: "Bezel" },
  { value: "pave", label: "Pavé" },
  { value: "channel", label: "Channel" },
  { value: "tension", label: "Tension" },
  { value: "flush", label: "Flush" },
  { value: "other", label: "Other" },
];

export const HEAD_STYLE_OPTIONS: { value: HeadStyle; label: string }[] = [
  { value: "solitaire", label: "Solitaire" },
  { value: "halo", label: "Halo" },
  { value: "three-stone", label: "Three-stone" },
  { value: "cluster", label: "Cluster" },
  { value: "other", label: "Other" },
];

export const SHANK_PROFILE_OPTIONS: { value: ShankProfile; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "comfort-fit", label: "Comfort fit" },
  { value: "knife-edge", label: "Knife edge" },
  { value: "rounded", label: "Rounded" },
  { value: "other", label: "Other" },
];

export const STONE_CUT_OPTIONS: { value: StoneCut; label: string }[] = [
  { value: "round", label: "Round" },
  { value: "oval", label: "Oval" },
  { value: "cushion", label: "Cushion" },
  { value: "emerald", label: "Emerald" },
  { value: "pear", label: "Pear" },
  { value: "marquise", label: "Marquise" },
  { value: "princess", label: "Princess" },
  { value: "radiant", label: "Radiant" },
  { value: "asscher", label: "Asscher" },
  { value: "heart", label: "Heart" },
  { value: "other", label: "Other" },
];

export const CLARITY_OPTIONS: ClarityGrade[] = [
  "FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3",
];

export const COLOR_OPTIONS: ColorGrade[] = [
  "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "fancy",
];
