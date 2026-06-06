import * as THREE from "three";

/** sRGB output — stable for PNG/JPEG export and canvas readback. */
export const VIEWER_OUTPUT_COLOR_SPACE = THREE.SRGBColorSpace;

export type ColorManagementSnapshot = {
  outputColorSpace: string;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
};

/**
 * Viewer tone mapping runs in the PostFX composer (ACES via ToneMappingEffect).
 * Keep the WebGLRenderer itself untoned so exports match the live viewport.
 */
export function applyViewerColorManagement(
  renderer: THREE.WebGLRenderer,
  exposure = 1,
): void {
  renderer.outputColorSpace = VIEWER_OUTPUT_COLOR_SPACE;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = exposure;
}

export function snapshotColorManagement(
  renderer: THREE.WebGLRenderer,
): ColorManagementSnapshot {
  return {
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
  };
}

export function restoreColorManagement(
  renderer: THREE.WebGLRenderer,
  snapshot: ColorManagementSnapshot,
): void {
  renderer.outputColorSpace = snapshot.outputColorSpace;
  renderer.toneMapping = snapshot.toneMapping;
  renderer.toneMappingExposure = snapshot.toneMappingExposure;
}
