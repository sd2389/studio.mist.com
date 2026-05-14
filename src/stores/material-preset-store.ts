import { create } from "zustand";
import type { SceneSettingsBuckets } from "@/lib/slot-materials/model-config";

/**
 * Material library — all values are physically motivated (real F0 reflectance for metals,
 * real IOR + dispersion for gems). Group split between metals and gems is enforced in the UI.
 */
export type MaterialPresetId =
  | "original"
  // metals — primary yellow karats
  | "gold-24k"
  | "gold-22k"
  | "gold-18k-yellow"
  | "gold-14k-yellow"
  | "gold-10k-yellow"
  | "gold-9k-yellow"
  // white-family metals
  | "gold-18k-white"
  | "gold-14k-white"
  | "gold-10k-white"
  | "platinum"
  | "silver-sterling"
  | "titanium"
  | "rhodium-black"
  // rose / red coppers
  | "gold-18k-rose"
  | "gold-14k-rose"
  | "gold-red"
  | "gold-red-light"
  // speciality colored golds (Au alloyed with Ag/Pd/Pt/Cu for hue)
  | "gold-green"
  | "gold-grey"
  | "gold-sand"
  | "gold-warm"
  // gems
  | "diamond"
  | "moissanite"
  | "zircon"
  | "ruby"
  | "sapphire"
  | "spinel"
  | "tanzanite"
  | "garnet-tsavorite"
  | "garnet-almandine"
  | "peridot"
  | "topaz-blue"
  | "tourmaline"
  | "aquamarine"
  | "emerald"
  | "morganite"
  | "amethyst"
  | "citrine"
  | "opal"
  | "jade"
  | "pearl"
  // fancy diamonds (color variants of "diamond" — same IOR, different absorption)
  | "diamond-canary"
  | "diamond-pink"
  | "diamond-blue"
  | "diamond-cognac"
  | "diamond-champagne"
  | "diamond-black";

export type LightingPresetId = "studio" | "soft" | "dark";

/**
 * Surface finish applied on top of a metal preset. Mirrors Substance Source's
 * pattern variants (Sandblasted / Hammered / etc.) — procedurally generated
 * roughness + normal maps so we don't ship asset packs.
 */
export type FinishId = "polished" | "brushed" | "satin" | "hammered" | "sandblasted";

type StudioState = {
  preset: MaterialPresetId;
  setPreset: (preset: MaterialPresetId) => void;
  slotSelections: Record<string, MaterialPresetId>;
  setSlotPreset: (slot: string, preset: MaterialPresetId) => void;
  replaceSlotSelections: (selections: Record<string, MaterialPresetId>) => void;
  resetSlotPresets: () => void;
  autoRotate: boolean;
  setAutoRotate: (value: boolean) => void;
  lighting: LightingPresetId;
  setLighting: (value: LightingPresetId) => void;
  finish: FinishId;
  setFinish: (finish: FinishId) => void;
  sceneSettings: SceneSettingsBuckets;
  setSceneSetting: (bucket: keyof SceneSettingsBuckets, value: string | null) => void;
  replaceSceneSettings: (settings: SceneSettingsBuckets) => void;
};

export const useMaterialPresetStore = create<StudioState>((set) => ({
  preset: "original",
  setPreset: (preset) => set({ preset }),
  slotSelections: {},
  setSlotPreset: (slot, preset) =>
    set((state) => ({
      slotSelections: { ...state.slotSelections, [slot]: preset },
    })),
  replaceSlotSelections: (slotSelections) => set({ slotSelections }),
  resetSlotPresets: () => set({ slotSelections: {} }),
  autoRotate: true,
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  lighting: "studio",
  setLighting: (lighting) => set({ lighting }),
  finish: "polished",
  setFinish: (finish) => set({ finish }),
  sceneSettings: {
    "ENVIRONMENT-METAL": null,
    "ENVIRONMENT-GEM": null,
    GROUND: null,
    BACKGROUND: null,
    VJSON: null,
  },
  setSceneSetting: (bucket, value) =>
    set((state) => ({
      sceneSettings: { ...state.sceneSettings, [bucket]: value },
    })),
  replaceSceneSettings: (sceneSettings) => set({ sceneSettings }),
}));
