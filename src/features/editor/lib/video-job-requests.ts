import {
  orbitPath,
  posesPath,
  turntableJobRequest,
  turntableJobSpec,
  type RenderJobCamera,
  type RenderJobRequest,
  type VideoJobSettings,
} from "@/features/render";
import type { LookSnapshot } from "@/features/viewer";
import { batchRenderTargets, type BatchJobTarget } from "@/lib/variants/batch-export";
import type { VideoMode } from "../hooks/useVideoExport";

/** What the Videos tab renders: its settings, the studio's view, poses and scene, and Multiple's picks. */
export type VideoJobsInput = {
  mode: VideoMode;
  settings: VideoJobSettings;
  /** The live view as it is when Render is clicked: Simple's orbit starts there, and each of Multiple's. */
  camera: RenderJobCamera;
  /** What Multi-angle cuts through, in order: the studio's four poses, then the saved ones. */
  poses: readonly { id: string }[];
  /** The studio's saved scene, and its look as the studio would save it now. */
  sceneId: number;
  look: LookSnapshot;
  /** This piece's file stem. */
  viewerId: string;
  /** Multiple's scenes and variants; null while they are read. */
  targets: BatchJobTarget[] | null;
};

/**
 * The Videos tab's turntable jobs (ADR 0005), named as the browser named its downloads. Simple:
 * one orbit from the live view. Multi-angle: one cut through the poses. Multiple: an orbit from
 * the live view for each scene and variant picked, as the browser recorded each in turn, for
 * one bulk request.
 */
export function videoJobRequests(input: VideoJobsInput): RenderJobRequest[] {
  const { mode, settings, camera, poses, sceneId, look, viewerId, targets } = input;
  if (mode === "multi-angle") {
    return [turntableJobRequest(turntableJobSpec(settings, posesPath(poses)), { sceneId, look, name: `${viewerId}-multi-angle` })];
  }
  const spec = turntableJobSpec(settings, orbitPath(camera));
  if (mode === "simple") return [turntableJobRequest(spec, { sceneId, look, name: `${viewerId}-360` })];
  return batchRenderTargets(targets ?? [], look, "360").map((target) => turntableJobRequest(spec, target));
}
