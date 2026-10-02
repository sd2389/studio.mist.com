import { create } from "zustand";
import { persist } from "zustand/middleware";

type State = {
  remaining: number;
  total: number;
  usedThisCycle: number;
  hydrated: boolean;
  hydrateFromServer: (remaining: number, total: number) => void;
  resetCycle: (remaining?: number, total?: number) => void;
};

export const useAiImageCreditsStore = create<State>()(
  persist(
    (set) => ({
      remaining: 0,
      total: 0,
      usedThisCycle: 0,
      hydrated: false,
      hydrateFromServer: (remaining, total) =>
        set({
          remaining,
          total,
          usedThisCycle: Math.max(0, total - remaining),
          hydrated: true,
        }),
      resetCycle: (remaining = 0, total = remaining) =>
        set({
          remaining,
          total,
          usedThisCycle: Math.max(0, total - remaining),
          hydrated: true,
        }),
    }),
    { name: "mist-studio-ai-image-credits" },
  ),
);
