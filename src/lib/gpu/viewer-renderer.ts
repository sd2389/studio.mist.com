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

type R3FRendererProps = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  [key: string]: unknown;
};

/** The renderer each canvas got, from its first `gl` call on. */
const canvasRenderers = new WeakMap<HTMLCanvasElement | OffscreenCanvas, Promise<ViewerRenderer>>();

/**
 * R3F `gl` factory — strips WebGL-only fields like `preserveDrawingBuffer`. One renderer per
 * canvas: R3F's `<Canvas>` configures its root on every render and asks for a renderer each
 * time until the first `init()` has resolved, so a render during that wait (a fetch landing, a
 * resize) used to put a second renderer on the same canvas. R3F resizes the renderer it holds
 * when the size changes, which happened once, before the second one was stored: that one kept
 * the 300×150 a fresh canvas starts with while the canvas element itself was resized, and
 * WebGPU refused every frame ("resolve target … does not match the size of the other attachments").
 */
export function createR3FWebGPURenderer(props: R3FRendererProps): Promise<ViewerRenderer> {
  const existing = canvasRenderers.get(props.canvas);
  if (existing) return existing;
  const renderer = createR3FRenderer(props);
  canvasRenderers.set(props.canvas, renderer);
  // A renderer that failed to start can be asked for again.
  renderer.catch(() => canvasRenderers.delete(props.canvas));
  return renderer;
}

function createR3FRenderer(props: R3FRendererProps): Promise<ViewerRenderer> {
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
