import type * as THREE from "three";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { create } from "zustand";

type HiresRefs = {
  gl: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
};

/** Pauses/resumes the live R3F frame loop (registered from inside `<Canvas>`). */
export type LiveLoopControl = {
  pause: () => void;
  resume: () => void;
};

type State = {
  refs: HiresRefs | null;
  setRefs: (refs: HiresRefs | null) => void;
  liveLoop: LiveLoopControl | null;
  setLiveLoop: (control: LiveLoopControl | null) => void;
};

export const useHiresExportStore = create<State>((set) => ({
  refs: null,
  setRefs: (refs) => set({ refs }),
  liveLoop: null,
  setLiveLoop: (liveLoop) => set({ liveLoop }),
}));

export function getHiresRefs(): HiresRefs | null {
  return useHiresExportStore.getState().refs;
}

let pauseDepth = 0;

/**
 * Stops the live viewport from rendering while an export owns the GPU. Returns an
 * idempotent release; the loop resumes when the last holder releases.
 */
export function pauseLiveRendering(): () => void {
  const control = useHiresExportStore.getState().liveLoop;
  if (!control) return () => undefined;
  pauseDepth += 1;
  if (pauseDepth === 1) control.pause();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pauseDepth = Math.max(0, pauseDepth - 1);
    if (pauseDepth === 0) control.resume();
  };
}

export async function withLiveRenderingPaused<T>(work: () => Promise<T>): Promise<T> {
  const release = pauseLiveRendering();
  try {
    return await work();
  } finally {
    release();
  }
}
