import * as THREE from "three";
import { create } from "zustand";

type Refs = {
  gl: THREE.WebGLRenderer;
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
