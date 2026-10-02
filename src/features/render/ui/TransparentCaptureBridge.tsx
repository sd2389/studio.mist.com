"use client";

import { invalidate, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect } from "react";
import { createExportLayers } from "@/lib/export-compositing";
import { renderWithPostFX } from "@/lib/viewer-postfx-pipeline";
import { getPostFXComposerRefs } from "@/stores/postfx-composer-store";
import { useTransparentCaptureStore } from "@/stores/transparent-capture-store";
import { createStageControl } from "../lib/stage-visibility";

function toPngDataUrl(source: CanvasImageSource & { width: number; height: number }): string {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * One-off transparent render of the live scene: no background, no studio set, no contact
 * shadow — the piece alone. The PostFX chain writes alpha ≈ 1, so coverage comes from a
 * plain render and colour from the PostFX render (see export-compositing.ts).
 */
export function TransparentCaptureBridge() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const setCaptureFn = useTransparentCaptureStore((state) => state.setCaptureFn);

  useEffect(() => {
    const layers = createExportLayers();
    const capture = (): string | null => {
      const prevBg = scene.background;
      const prevColor = new THREE.Color();
      gl.getClearColor(prevColor);
      const prevAlpha = gl.getClearAlpha();
      const stage = createStageControl(scene);

      scene.background = null;
      stage.showSet(false);
      stage.showShadows(false);
      gl.setClearColor(0x000000, 0);

      try {
        gl.render(scene, camera as THREE.Camera);
        const postfx = getPostFXComposerRefs();
        if (!postfx) return gl.domElement.toDataURL("image/png");
        const matte = layers.copyMatte(gl.domElement);
        renderWithPostFX(postfx.composer);
        return toPngDataUrl(layers.cutout(matte, postfx.gl.domElement));
      } finally {
        stage.restore();
        scene.background = prevBg;
        gl.setClearColor(prevColor, prevAlpha);
        invalidate();
      }
    };

    setCaptureFn(capture);
    return () => setCaptureFn(null);
  }, [gl, scene, camera, setCaptureFn]);

  return null;
}
