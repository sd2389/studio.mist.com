import * as THREE from "three";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { create } from "zustand";

type Refs = {
  gl: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
};

type VideoCaptureState = {
  refs: Refs | null;
  setRefs: (refs: Refs | null) => void;
};

export const useVideoCaptureStore = create<VideoCaptureState>((set) => ({
  refs: null,
  setRefs: (refs) => set({ refs }),
}));

export function getVideoCaptureRefs(): Refs | null {
  return useVideoCaptureStore.getState().refs;
}
