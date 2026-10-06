"use client";

import { useBatchTargets, type BatchExport } from "@/features/editor/hooks/useBatchExport";
import type { VideoMode } from "@/features/editor/hooks/useVideoExport";
import {
  liveViewCamera,
  outputsLabel,
  RenderJobButton,
  useExportScene,
  type RenderJobRequest,
  type VideoJobSettings,
} from "@/features/render";
import { videoJobRequests } from "../lib/video-job-requests";

type VideoJobRenderProps = {
  mode: VideoMode;
  settings: VideoJobSettings;
  /** What Multi-angle cuts through, in order. */
  poses: readonly { id: string }[];
  viewerId: string;
  batch: BatchExport;
};

/**
 * The Videos tab's Render on the server (ADR 0005): a turntable of the live view, a cut through
 * the poses, or in "Multiple" one turntable per scene and variant picked, in one bulk request
 * priced before it starts. The price says how many videos it makes, and offers the upgrade
 * where the plan has no batch export. Nothing is recorded in the browser.
 */
export function VideoJobRender({ mode, settings, poses, viewerId, batch }: VideoJobRenderProps) {
  const exportScene = useExportScene();
  const { targets, error } = useBatchTargets(batch, mode === "multiple");
  const jobCount = targets?.length ?? batch.estimatedJobCount;

  /** The jobs a click starts, from the view as it is then. */
  function videoJobs(): RenderJobRequest[] | null {
    const camera = liveViewCamera();
    if (!exportScene || !camera) return null;
    const { sceneId } = exportScene;
    return videoJobRequests({ mode, settings, camera, poses, sceneId, look: exportScene.look(), viewerId, targets });
  }

  return (
    <>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {targets?.length === 0 ? (
        <p className="text-xs text-muted-foreground">Select at least one variant or save variants in Settings.</p>
      ) : null}
      <RenderJobButton
        requests={videoJobs}
        bulk={mode === "multiple"}
        disabled={mode === "multiple" && !batch.batchExportEnabled}
      >
        {mode === "multiple" ? `Render ${outputsLabel("turntable", jobCount)}` : "Render video"}
      </RenderJobButton>
    </>
  );
}
