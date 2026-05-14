import { create } from "zustand";

type ScreenshotState = {
  captureFn: (() => string) | null;
  setCaptureFn: (fn: (() => string) | null) => void;
};

export const useScreenshotStore = create<ScreenshotState>((set) => ({
  captureFn: null,
  setCaptureFn: (captureFn) => set({ captureFn }),
}));

export function captureFrameToDataUrl(): string | null {
  const fn = useScreenshotStore.getState().captureFn;
  return fn?.() ?? null;
}
