"use client";

// Mount inside <Canvas> in src/features/viewer/ui/ViewerCanvas.tsx
// between <TransparentCaptureBridge /> and </Suspense> (after line 89).

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { asViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { useHiresExportStore } from "@/stores/hires-export-store";

export function HiresExportBridge() {
  const gl = asViewerRenderer(useThree((s) => s.gl));
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const getState = useThree((s) => s.get);
  const setRefs = useHiresExportStore((s) => s.setRefs);
  const setLiveLoop = useHiresExportStore((s) => s.setLiveLoop);

  useEffect(() => {
    setRefs({ gl, scene, camera });
    return () => setRefs(null);
  }, [gl, scene, camera, setRefs]);

  useEffect(() => {
    let resumeMode: "always" | "demand" | null = null;
    setLiveLoop({
      pause: () => {
        const { frameloop, setFrameloop } = getState();
        if (frameloop === "never") return;
        resumeMode = frameloop;
        setFrameloop("never");
      },
      resume: () => {
        if (!resumeMode) return;
        // The store change invalidates the root, which restarts R3F's rAF loop.
        getState().setFrameloop(resumeMode);
        resumeMode = null;
      },
    });
    return () => {
      if (resumeMode) getState().setFrameloop(resumeMode);
      setLiveLoop(null);
    };
  }, [getState, setLiveLoop]);

  return null;
}
