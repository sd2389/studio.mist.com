import { create } from "zustand";

/** A viewing aid, not part of the saved look: off for photography, ASET to judge cut quality. */
export type GemScopeMode = "off" | "aset";

type GemScopeState = {
  mode: GemScopeMode;
  setMode: (mode: GemScopeMode) => void;
};

export const useGemScopeStore = create<GemScopeState>((set) => ({
  mode: "off",
  setMode: (mode) => set({ mode }),
}));
