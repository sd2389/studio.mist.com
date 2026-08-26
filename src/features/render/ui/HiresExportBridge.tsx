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
  const setRefs = useHiresExportStore((s) => s.setRefs);

  useEffect(() => {
    setRefs({ gl, scene, camera });
    return () => setRefs(null);
  }, [gl, scene, camera, setRefs]);

  return null;
}
