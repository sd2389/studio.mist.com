import { readViewportBackdrop } from "@/lib/export-backdrop";
import type { RecordTurntableOpts } from "@/lib/video-capture";
import { captureCurrentCameraPose } from "@/stores/orbit-controls-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { getVideoCaptureRefs } from "@/stores/video-capture-store";
import { loadExportPlan } from "./export-plan";

export type TurntableSettings = Pick<RecordTurntableOpts, "width" | "height" | "frameCount" | "fps" | "bitrate">;

/**
 * Recording options for a turntable of the live studio view: its renderer, scene and camera,
 * the viewport's exposure and post-processing, the orbit target, the CSS backdrop and the
 * plan's limits (the recorder refuses a size above the cap; Free frames get the watermark).
 * Throws until the 3D view is ready.
 */
export async function turntableCaptureOptions(
  settings: TurntableSettings,
  signal: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<RecordTurntableOpts> {
  const limits = await loadExportPlan();
  const refs = getVideoCaptureRefs();
  if (!refs) throw new Error("3D view not ready — wait for the model to load, then try again.");
  const { exposure, postfxConfig } = getRenderFidelity();
  return {
    gl: refs.gl,
    scene: refs.scene,
    camera: refs.camera,
    ...settings,
    exposure,
    postfxConfig,
    target: captureCurrentCameraPose()?.target,
    backdrop: readViewportBackdrop(refs.gl.domElement),
    limits,
    onProgress,
    signal,
  };
}

/** Expected file size for a bitrate (bits per second) over `durationSec`, e.g. "~3.2 MB". */
export function videoSizeLabel(bitrate: number, durationSec: number): string {
  const mb = (bitrate * durationSec) / 8 / 1024 / 1024;
  return mb < 1 ? `~${(mb * 1024).toFixed(0)} KB` : `~${mb.toFixed(1)} MB`;
}
