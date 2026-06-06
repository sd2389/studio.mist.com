"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { renderWithPostFX } from "@/lib/viewer-postfx-pipeline";
import { getPostFXComposerRefs } from "@/stores/postfx-composer-store";
import { useScreenshotStore } from "@/stores/screenshot-store";

/** Registers WebGL canvas capture with the global screenshot store (must live inside `<Canvas>`). */
export function ScreenshotBridge() {
  const gl = useThree((state) => state.gl);
  const setCaptureFn = useScreenshotStore((state) => state.setCaptureFn);

  useEffect(() => {
    setCaptureFn(() => {
      const postfx = getPostFXComposerRefs();
      if (postfx) {
        renderWithPostFX(postfx.composer, postfx.gl);
        return postfx.gl.domElement.toDataURL("image/png");
      }
      return gl.domElement.toDataURL("image/png");
    });
    return () => setCaptureFn(null);
  }, [gl, setCaptureFn]);

  return null;
}
