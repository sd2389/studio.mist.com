import { create } from "zustand";
import type { GemPresetId } from "@/lib/gem-gpu/gem-configs";
import type {
  EmbedSettings,
  ModelTransform,
  SavedPose,
  SceneAdvancedSettings,
  SceneSettingsBuckets,
} from "@/lib/slot-materials/model-config";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";

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
  // gems — full Phase 1 catalog (see gem-configs.ts)
  | GemPresetId;

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
  slotSelections: Record<string, SlotMaterialRef>;
  setSlotPreset: (slot: string, preset: SlotMaterialRef) => void;
  replaceSlotSelections: (selections: Record<string, SlotMaterialRef>) => void;
  resetSlotPresets: () => void;
  autoRotate: boolean;
  setAutoRotate: (value: boolean) => void;
  lighting: LightingPresetId;
  setLighting: (value: LightingPresetId) => void;
  finish: FinishId;
  setFinish: (finish: FinishId) => void;
  sceneSettings: SceneSettingsBuckets;
  setSceneSetting: (bucket: keyof SceneSettingsBuckets, value: string | null) => void;
  setSceneAdvanced: (patch: Partial<SceneAdvancedSettings>) => void;
  setModelTransform: (transform: ModelTransform) => void;
  setCustomBackground: (url: string | null) => void;
  setPoses: (poses: SavedPose[]) => void;
  setActivePoseId: (poseId: string | null) => void;
  setEmbedSettings: (patch: Partial<EmbedSettings>) => void;
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
  setSceneAdvanced: (patch) =>
    set((state) => ({
      sceneSettings: {
        ...state.sceneSettings,
        advanced: { ...state.sceneSettings.advanced, ...patch },
      },
    })),
  setModelTransform: (modelTransform) =>
    set((state) => ({
      sceneSettings: { ...state.sceneSettings, modelTransform },
    })),
  setCustomBackground: (customBackground) =>
    set((state) => ({
      sceneSettings: { ...state.sceneSettings, customBackground },
    })),
  setPoses: (poses) =>
    set((state) => ({
      sceneSettings: { ...state.sceneSettings, poses },
    })),
  setActivePoseId: (activePoseId) =>
    set((state) => ({
      sceneSettings: { ...state.sceneSettings, activePoseId },
    })),
  setEmbedSettings: (patch) =>
    set((state) => ({
      sceneSettings: {
        ...state.sceneSettings,
        embed: { ...state.sceneSettings.embed, ...patch },
      },
    })),
  replaceSceneSettings: (sceneSettings) => set({ sceneSettings }),
}));
