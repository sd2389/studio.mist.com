"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { asViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { useVideoCaptureStore } from "@/stores/video-capture-store";

// MAIN-THREAD TODO: in src/features/viewer/ui/ViewerCanvas.tsx, add `<VideoCaptureBridge />`
// directly after `<TransparentCaptureBridge />` (line 89), before `</Suspense>` on line 90.

export function VideoCaptureBridge() {
  const gl = asViewerRenderer(useThree((s) => s.gl));
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const setRefs = useVideoCaptureStore((s) => s.setRefs);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    setRefs({ gl, scene, camera });
    return () => setRefs(null);
  }, [gl, scene, camera, setRefs]);

  return null;
}
