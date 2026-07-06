import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type EffectiveQuality,
  type QualityLevel,
  readDeviceCaps,
  resolveEffectiveQuality,
} from "@/lib/viewer-quality";

type ViewerQualityState = {
  level: QualityLevel;
  effective: EffectiveQuality;
  setLevel: (level: QualityLevel) => void;
};

export const useViewerQualityStore = create<ViewerQualityState>()(
  persist(
    (set) => ({
      level: "auto",
      effective: resolveEffectiveQuality("auto", readDeviceCaps()),
      setLevel: (level) =>
        set({ level, effective: resolveEffectiveQuality(level, readDeviceCaps()) }),
    }),
    {
      name: "viewer-quality",
      partialize: (state) => ({ level: state.level }),
      onRehydrateStorage: () => (state) => {
        // recompute effective for THIS device; only the chosen level persists
        state?.setLevel(state.level);
      },
    },
  ),
);
