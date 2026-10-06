import { Vector2 } from "three";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";

/**
 * Fails when the live canvas and the renderer drawing it disagree on its size, which is what a
 * second renderer on the canvas looked like: R3F kept one at a fresh canvas's 300×150 while the
 * canvas was resized, WebGPU refused every frame and on Linux the readback hung (fixed in
 * `createR3FWebGPURenderer`). A clear error instead of a hang if it ever comes back.
 */
export function assertLiveCanvasSized(gl: ViewerRenderer): void {
  const drawn = gl.getDrawingBufferSize(new Vector2());
  const { width, height } = gl.domElement;
  if (drawn.x !== width || drawn.y !== height) {
    throw new Error(`The live canvas is ${width}x${height} but its renderer draws ${drawn.x}x${drawn.y}.`);
  }
}
