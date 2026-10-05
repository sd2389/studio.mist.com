import { describe, expect, it } from "vitest";
import type { Vector2 } from "three";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { assertLiveCanvasSized } from "./live-canvas";

function rendererDrawing(canvas: { width: number; height: number }, drawn: { x: number; y: number }): ViewerRenderer {
  return {
    domElement: canvas,
    getDrawingBufferSize: (target: Vector2) => target.set(drawn.x, drawn.y),
  } as unknown as ViewerRenderer;
}

describe("assertLiveCanvasSized", () => {
  it("passes when the renderer draws the canvas's size", () => {
    expect(() => assertLiveCanvasSized(rendererDrawing({ width: 512, height: 288 }, { x: 512, y: 288 }))).not.toThrow();
  });

  it("fails on a renderer left at a fresh canvas's 300x150", () => {
    expect(() => assertLiveCanvasSized(rendererDrawing({ width: 512, height: 288 }, { x: 300, y: 150 }))).toThrow(
      "The live canvas is 512x288 but its renderer draws 300x150.",
    );
  });
});
