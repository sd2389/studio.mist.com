"use client";

import { invalidate, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect } from "react";
import { renderWithPostFX } from "@/lib/viewer-postfx-pipeline";
import { getPostFXComposerRefs } from "@/stores/postfx-composer-store";
import { useTransparentCaptureStore } from "@/stores/transparent-capture-store";

/**
 * One-off render with transparent clear + no scene background, then restores state.
 * Routes through the live PostFX composer when available so cutouts match the viewport.
 */
export function TransparentCaptureBridge() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const setCaptureFn = useTransparentCaptureStore((state) => state.setCaptureFn);

  useEffect(() => {
    const capture = (): string | null => {
      const prevBg = scene.background;
      const prevColor = new THREE.Color();
      gl.getClearColor(prevColor);
      const prevAlpha = gl.getClearAlpha();

      scene.background = null;
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, true);

      const postfx = getPostFXComposerRefs();
      if (postfx) {
        renderWithPostFX(postfx.composer, postfx.gl);
        const dataUrl = postfx.gl.domElement.toDataURL("image/png");
        scene.background = prevBg;
        gl.setClearColor(prevColor, prevAlpha);
        invalidate();
        return dataUrl;
      }

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
