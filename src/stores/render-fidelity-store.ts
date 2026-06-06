import type { ViewerPostFXConfig } from "@/lib/viewer-postfx-config";
import { DEFAULT_VIEWER_POSTFX } from "@/lib/viewer-postfx-config";
import { create } from "zustand";

export type RenderFidelityState = {
  exposure: number;
  postfxConfig: ViewerPostFXConfig;
  setRenderFidelity: (next: { exposure: number; postfxConfig: ViewerPostFXConfig }) => void;
};

export const useRenderFidelityStore = create<RenderFidelityState>((set) => ({
  exposure: 1,
  postfxConfig: DEFAULT_VIEWER_POSTFX,
  setRenderFidelity: (next) => set(next),
}));

export function getRenderFidelity(): Pick<RenderFidelityState, "exposure" | "postfxConfig"> {
  const { exposure, postfxConfig } = useRenderFidelityStore.getState();
  return { exposure, postfxConfig };
}
