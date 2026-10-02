import type { ExportLimits } from "@/lib/export-limits";
import { create } from "zustand";

type CaptureFn = (limits?: ExportLimits) => string;

type ScreenshotState = {
  captureFn: CaptureFn | null;
  setCaptureFn: (fn: CaptureFn | null) => void;
};

export const useScreenshotStore = create<ScreenshotState>((set) => ({
  captureFn: null,
  setCaptureFn: (captureFn) => set({ captureFn }),
}));

/**
 * The live frame as a PNG data URL. An export passes the plan's limits: the frame is then
 * scaled to fit the cap and watermarked when the plan asks. Thumbnails pass none.
 */
export function captureFrameToDataUrl(limits?: ExportLimits): string | null {
  const fn = useScreenshotStore.getState().captureFn;
  return fn?.(limits) ?? null;
}
