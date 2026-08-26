import type * as THREE from "three";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { create } from "zustand";

type HiresRefs = {
  gl: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
};

type State = {
  refs: HiresRefs | null;
  setRefs: (refs: HiresRefs | null) => void;
};

export const useHiresExportStore = create<State>((set) => ({
  refs: null,
  setRefs: (refs) => set({ refs }),
}));

export function getHiresRefs(): HiresRefs | null {
  return useHiresExportStore.getState().refs;
}
