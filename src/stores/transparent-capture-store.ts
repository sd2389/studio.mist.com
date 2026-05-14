import { create } from "zustand";

type State = {
  captureFn: (() => string | null) | null;
  setCaptureFn: (fn: (() => string | null) | null) => void;
};

export const useTransparentCaptureStore = create<State>((set) => ({
  captureFn: null,
  setCaptureFn: (captureFn) => set({ captureFn }),
}));

/** Transparent PNG (RGBA) data URL — only valid after TransparentCaptureBridge mounts inside Canvas. */
export function captureTransparentPng(): string | null {
  const fn = useTransparentCaptureStore.getState().captureFn;
  return fn?.() ?? null;
}
