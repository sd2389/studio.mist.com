import * as THREE from "three";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";

/** sRGB output — stable for PNG/JPEG export and canvas readback. */
export const VIEWER_OUTPUT_COLOR_SPACE = THREE.SRGBColorSpace;

export type ColorManagementSnapshot = {
  outputColorSpace: string;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
};

/**
 * Viewer tone mapping runs in the TSL RenderPipeline (ACES via renderOutput).
 * Keep the renderer itself untoned so exports match the live viewport.
 */
export function applyViewerColorManagement(renderer: ViewerRenderer, exposure = 1): void {
  renderer.outputColorSpace = VIEWER_OUTPUT_COLOR_SPACE;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = exposure;
}

export function snapshotColorManagement(renderer: ViewerRenderer): ColorManagementSnapshot {
  return {
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
  };
}

export function restoreColorManagement(
  renderer: ViewerRenderer,
  snapshot: ColorManagementSnapshot,
): void {
  renderer.outputColorSpace = snapshot.outputColorSpace as typeof renderer.outputColorSpace;
  renderer.toneMapping = snapshot.toneMapping;
  renderer.toneMappingExposure = snapshot.toneMappingExposure;
}
