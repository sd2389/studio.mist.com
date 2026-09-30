import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import type { ViewerPostFXComposer } from "@/lib/viewer-postfx-pipeline";
import { create } from "zustand";

type PostFXComposerRefs = {
  composer: ViewerPostFXComposer;
  gl: ViewerRenderer;
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
