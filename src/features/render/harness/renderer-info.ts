import { createViewerRenderer, type ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import type { RendererInfo } from "./job-payload";

type AdapterInfoLike = { vendor?: string; architecture?: string; device?: string; description?: string };
type GpuLike = {
  requestAdapter(options?: { powerPreference?: "high-performance" | "low-power" }): Promise<{ info?: AdapterInfoLike } | null>;
};

/** The adapter the browser offers WebGPU on; null without `navigator.gpu` or without an adapter. */
async function requestAdapterInfo(): Promise<RendererInfo["adapter"]> {
  const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
  const adapter = await gpu?.requestAdapter({ powerPreference: "high-performance" }).catch(() => null);
  if (!adapter) return null;
  const { vendor = "", architecture = "", device = "", description = "" } = adapter.info ?? {};
  return { vendor, architecture, device, description };
}

/** Which backend three.js picked for `renderer`, and the browser and adapter under it. */
export async function describeRenderer(renderer: ViewerRenderer): Promise<RendererInfo> {
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true ? "webgpu" : "webgl2";
  return { browser: navigator.userAgent, backend, adapter: await requestAdapterInfo() };
}

/**
 * What would draw a render here. A throwaway renderer shows whether three.js gets WebGPU or
 * falls back to WebGL 2, which `requestAdapter()` alone does not tell.
 */
export async function probeRenderer(): Promise<RendererInfo> {
  const renderer = await createViewerRenderer({ canvas: document.createElement("canvas") });
  try {
    return await describeRenderer(renderer);
  } finally {
    renderer.dispose();
  }
}
