"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { applySavedLook, resolveModelConfig, useFixedClockWarmup, useLookStage, ViewerStage } from "@/features/viewer";
import { getHiresRefs } from "@/stores/hires-export-store";
import { pinExportQuality } from "./export-quality";
import {
  jobImageSize,
  readHarnessJob,
  type HarnessJob,
  type HarnessResult,
  type RenderedFile,
  type RenderJobPayload,
} from "./job-payload";
import { renderSpinFiles, renderTurntableFrames } from "./render-frames";
import { renderJobImages } from "./render-images";
import { describeRenderer } from "./renderer-info";
import { createSinkClient, type SinkClient } from "./sink-client";

/** Frames drawn on the fixed clock before a job renders (frame N at N/60 s). */
const EXPORT_WARMUP_FRAMES = 60;
/** The live view's longest side. Images render offscreen at the job's own size. */
const PREVIEW_EDGE = 512;

function reportFailure(error: unknown) {
  window.__HARNESS_STATE__ = `error:${error instanceof Error ? error.message : String(error)}`;
}

function previewSize({ width, height }: { width: number; height: number }) {
  const scale = PREVIEW_EDGE / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** The job's files: the images of a still, an angle set or a spin. A turntable's frames go raw. */
async function renderOutputs(payload: RenderJobPayload, sink: SinkClient): Promise<RenderedFile[]> {
  if (payload.kind === "turntable") {
    await renderTurntableFrames(payload, sink);
    return [];
  }
  if (payload.kind === "spin") return renderSpinFiles(payload, sink);
  return renderJobImages(payload, sink);
}

/** Renders the job's images or frames, hands them to the sink, then reports what drew them. */
async function renderJob(job: HarnessJob): Promise<void> {
  const sink = createSinkClient(job.sink);
  await sink.postProgress(0, "rendering");
  const outputs = await renderOutputs(job.payload, sink);
  const refs = getHiresRefs();
  if (!refs) throw new Error("The scene has gone.");
  const result: HarnessResult = { renderer: await describeRenderer(refs.gl), outputs };
  window.__RENDER_RESULT__ = result;
  window.__HARNESS_STATE__ = "done";
}

/** The job's look on the studio's stage, warmed up on the fixed clock, then rendered once. */
function ExportStage({ job, modelUrl }: { job: HarnessJob; modelUrl: string }) {
  const { look, look_items: lookItems } = job.payload;
  const modelConfig = useMemo(() => resolveModelConfig(look), [look]);
  const stage = useLookStage({ modelUrl, modelConfig, catalogs: null, lookItems });
  const render = useCallback(() => {
    void renderJob(job).catch(reportFailure);
  }, [job]);
  useFixedClockWarmup(true, EXPORT_WARMUP_FRAMES, render);

  // Laid out as the embed lays out its stage, so the CSS backdrop is read as the studio reads it.
  return (
    <div className="studio-stage flex flex-col" style={previewSize(jobImageSize(job.payload))} data-harness-canvas>
      <ViewerStage {...stage} autoRotate={false} frameloop="never" />
    </div>
  );
}

/**
 * The render harness's export mode (ADR 0005): renders the job the worker put in
 * `window.__RENDER_JOB__`. The look goes into the studio store, the model comes from the sink,
 * and the page reports through `window.__HARNESS_STATE__` and `window.__RENDER_RESULT__`.
 */
export function HarnessExport() {
  const [loaded, setLoaded] = useState<{ job: HarnessJob; modelUrl: string } | null>(null);

  useEffect(() => {
    window.__HARNESS_STATE__ = "loading";
    let cancelled = false;
    let modelUrl: string | null = null;
    (async () => {
      const job = readHarnessJob(window.__RENDER_JOB__);
      const sink = createSinkClient(job.sink);
      await sink.postProgress(0, "loading");
      const model = await sink.fetchModel();
      if (cancelled) return;
      pinExportQuality();
      applySavedLook(job.payload.look, job.payload.look_items);
      modelUrl = URL.createObjectURL(model);
      setLoaded({ job, modelUrl });
    })().catch(reportFailure);
    return () => {
      cancelled = true;
      if (modelUrl) URL.revokeObjectURL(modelUrl);
    };
  }, []);

  return loaded ? <ExportStage job={loaded.job} modelUrl={loaded.modelUrl} /> : null;
}
