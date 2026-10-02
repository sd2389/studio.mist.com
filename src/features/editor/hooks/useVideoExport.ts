"use client";

import { turntableCaptureOptions, useCaptureRun, type TurntableSettings } from "@/features/render";
import { downloadBlob } from "@/lib/export-presets";
import { batchFilenamePrefix, runBatchExportJobs } from "@/lib/variants/batch-export";
import {
  isAbortError,
  recordMultiAngle,
  recordTurntable,
  type CameraPose,
  type RecordTurntableOpts,
} from "@/lib/video-capture";
import { withLiveRenderingPaused } from "@/stores/hires-export-store";
import { getVideoCaptureRefs } from "@/stores/video-capture-store";
import type { BatchExport, BatchTileResult } from "./useBatchExport";

export type VideoMode = "simple" | "multi-angle" | "multiple";

type VideoExportArgs = {
  mode: VideoMode;
  settings: TurntableSettings;
  /** The saved poses a multi-angle video cycles through. */
  poseAngles: CameraPose[];
  viewerId: string;
  batch: BatchExport;
};

/**
 * Records and downloads the Videos tab's export: a turntable, a cut through the saved poses,
 * or a turntable for each variant and model in a batch.
 */
export function useVideoExport({ mode, settings, poseAngles, viewerId, batch }: VideoExportArgs) {
  const run = useCaptureRun();

  function captureOptions(signal: AbortSignal, onProgress?: (p: number) => void): Promise<RecordTurntableOpts> {
    return turntableCaptureOptions(settings, signal, onProgress);
  }

  async function render() {
    run.reset();

    const refs = getVideoCaptureRefs();
    if (!refs) {
      run.setError("Viewer not ready. Wait for the model to load.");
      return;
    }

    await run.capture(async (signal, onProgress) => {
      const baseOpts = await captureOptions(signal, onProgress);

      if (mode === "multiple") {
        if (!batch.batchExportEnabled) {
          run.setError("Batch export requires a plan upgrade.");
          return;
        }

        const jobs = await batch.buildJobs();

        if (jobs.length === 0) {
          run.setError("Select at least one variant or save variants in Settings.");
          return;
        }

        const tileResults: BatchTileResult[] = [];
        let completed = 0;

        await runBatchExportJobs(jobs, batch.batchContext, async (job) => {
          const label = batchFilenamePrefix(job);
          try {
            const jobOpts = await captureOptions(signal);
            const result = await withLiveRenderingPaused(() => recordTurntable(jobOpts));
            const ext = result.kind === "png-zip" ? "zip" : "mp4";
            downloadBlob(result.blob, `${label}-360.${ext}`);
            if (result.notice) run.setNotice(result.notice);
            tileResults.push({ ok: true, label });
          } catch (e) {
            if (isAbortError(e)) throw e;
            tileResults.push({
              ok: false,
              label,
              message: e instanceof Error ? e.message : "Render failed",
            });
          } finally {
            completed += 1;
            run.setProgress(completed / jobs.length);
            run.setStatus(`Batch ${completed}/${jobs.length}`);
          }
          return tileResults[tileResults.length - 1]!;
        });

        const failed = tileResults.filter((t) => !t.ok);
        run.setStatus(
          failed.length === 0
            ? `Downloaded ${tileResults.length} videos`
            : `Finished ${tileResults.length} jobs — ${failed.length} failed`,
        );
        if (failed.length > 0) {
          run.setError(failed.map((f) => `${f.label}: ${f.message}`).join("; "));
        }
        return;
      }

      const result = await withLiveRenderingPaused(() =>
        mode === "multi-angle"
          ? recordMultiAngle({ ...baseOpts, poses: poseAngles })
          : recordTurntable(baseOpts),
      );

      const isZip = result.kind === "png-zip";
      const suffix = mode === "multi-angle" ? "multi-angle" : "360";
      downloadBlob(result.blob, `${viewerId}-${suffix}.${isZip ? "zip" : "mp4"}`);
      run.setNotice(result.notice);
      run.setStatus(
        isZip
          ? `Downloaded ZIP of ${settings.frameCount} PNG frames`
          : `Downloaded MP4 (${(result.blob.size / 1024 / 1024).toFixed(1)} MB · ${result.codec})`,
      );
    });
  }

  return { ...run, render };
}
