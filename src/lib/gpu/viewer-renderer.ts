import type { WebGPURenderer } from "three/webgpu";

export type ViewerRenderer = WebGPURenderer;

export type ViewerRendererOptions = {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  antialias?: boolean;
  alpha?: boolean;
  depth?: boolean;
  stencil?: boolean;
  powerPreference?: "low-power" | "high-performance";
  toneMappingExposure?: number;
};

/**
 * Creates a Three.js universal renderer (WebGPU first, WebGL 2 fallback).
 * Always `await` this — `WebGPURenderer.init()` is async.
 */
export async function createViewerRenderer(
  parameters: ViewerRendererOptions = {},
): Promise<ViewerRenderer> {
  const { toneMappingExposure, ...rendererParams } = parameters;
  const { WebGPURenderer } = await import("three/webgpu");
  const renderer = new WebGPURenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    ...rendererParams,
  });
  await renderer.init();
  if (typeof toneMappingExposure === "number") {
    renderer.toneMappingExposure = toneMappingExposure;
  }
  return renderer;
}

/** R3F types `state.gl` as WebGLRenderer; the live instance is WebGPURenderer. */
export function asViewerRenderer(gl: unknown): ViewerRenderer {
  return gl as ViewerRenderer;
}

/** R3F `gl` factory — strips WebGL-only fields like `preserveDrawingBuffer`. */
export async function createR3FWebGPURenderer(props: {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  [key: string]: unknown;
}): Promise<ViewerRenderer> {
  return createViewerRenderer({
    canvas: props.canvas,
    antialias: typeof props.antialias === "boolean" ? props.antialias : true,
    alpha: typeof props.alpha === "boolean" ? props.alpha : true,
    depth: typeof props.depth === "boolean" ? props.depth : undefined,
    stencil: typeof props.stencil === "boolean" ? props.stencil : undefined,
    powerPreference:
      props.powerPreference === "low-power" || props.powerPreference === "high-performance"
        ? props.powerPreference
        : "high-performance",
    toneMappingExposure:
      typeof props.toneMappingExposure === "number" ? props.toneMappingExposure : undefined,
  });
}
