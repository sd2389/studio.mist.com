"use client";

import { invalidate, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect } from "react";
import { useTransparentCaptureStore } from "@/stores/transparent-capture-store";

/**
 * One-off render with transparent clear + no scene background, then restores state.
 * Uses raw `gl.render(scene, camera)` so the frame matches the 3D scene (post-FX may differ from on-screen composer output).
 */
export function TransparentCaptureBridge() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const setCaptureFn = useTransparentCaptureStore((s) => s.setCaptureFn);

  useEffect(() => {
    const capture = (): string | null => {
      const prevBg = scene.background;
      const prevColor = new THREE.Color();
      gl.getClearColor(prevColor);
      const prevAlpha = gl.getClearAlpha();

      scene.background = null;
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, true);
      gl.render(scene, camera as THREE.Camera);

      const dataUrl = gl.domElement.toDataURL("image/png");

      scene.background = prevBg;
      gl.setClearColor(prevColor, prevAlpha);
      invalidate();
      return dataUrl;
    };

    setCaptureFn(capture);
    return () => setCaptureFn(null);
  }, [gl, scene, camera, setCaptureFn]);

  return null;
}
