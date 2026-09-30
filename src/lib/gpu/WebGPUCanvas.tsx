"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { createR3FWebGPURenderer } from "@/lib/gpu/viewer-renderer";

type WebGPUCanvasProps = Omit<CanvasProps, "gl">;

/** R3F canvas locked to `WebGPURenderer` (WebGL 2 only as the renderer fallback). */
export function WebGPUCanvas({ children, ...props }: WebGPUCanvasProps) {
  return (
    <Canvas {...props} gl={createR3FWebGPURenderer as CanvasProps["gl"]}>
      {children}
    </Canvas>
  );
}
