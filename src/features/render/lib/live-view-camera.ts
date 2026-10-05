import { captureCurrentCameraPose } from "@/stores/orbit-controls-store";
import type { RenderJobCamera } from "./render-jobs-api";

/**
 * The live view as a job's camera (`{ view }`, drawn with the viewer's lens), as the viewer
 * shows it at this moment; null until its controls exist.
 */
export function liveViewCamera(): RenderJobCamera | null {
  const pose = captureCurrentCameraPose();
  return pose ? { view: { position: pose.cameraPosition, target: pose.target } } : null;
}
