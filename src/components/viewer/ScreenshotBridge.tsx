"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useScreenshotStore } from "@/stores/screenshot-store";

/** Registers WebGL canvas capture with the global screenshot store (must live inside `<Canvas>`). */
export function ScreenshotBridge() {
  const gl = useThree((s) => s.gl);
  const setCaptureFn = useScreenshotStore((s) => s.setCaptureFn);

  useEffect(() => {
    setCaptureFn(() => gl.domElement.toDataURL("image/png"));
    return () => setCaptureFn(null);
  }, [gl, setCaptureFn]);

  return null;
}
