import type { EffectComposer } from "postprocessing";
import type * as THREE from "three";
import { create } from "zustand";

type PostFXComposerRefs = {
  composer: EffectComposer;
  gl: THREE.WebGLRenderer;
};

type PostFXComposerState = {
  refs: PostFXComposerRefs | null;
  setRefs: (refs: PostFXComposerRefs | null) => void;
};

export const usePostFXComposerStore = create<PostFXComposerState>((set) => ({
  refs: null,
  setRefs: (refs) => set({ refs }),
}));

export function getPostFXComposerRefs(): PostFXComposerRefs | null {
  return usePostFXComposerStore.getState().refs;
}
