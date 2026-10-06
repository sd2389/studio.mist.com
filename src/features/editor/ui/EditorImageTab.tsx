"use client";

import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useBatchExport,
  useBatchTargets,
  type BatchExport,
  type BatchExportTabProps,
  type BatchTileResult,
} from "@/features/editor/hooks/useBatchExport";
import {
  CampaignPackLauncher,
  DEFAULT_STILL_EXPORT,
  exportStill,
  JOB_JPEG_QUALITY_MIN,
  liveViewCamera,
  outputsLabel,
  RenderJobButton,
  StillExportSettings,
  stillExportLabel,
  stillJobRequest,
  stillJobSpec,
  useExportScene,
  useServerExports,
  type RenderJobRequest,
  type StillExportOptions,
} from "@/features/render";
import { ModelMultiSelect, VariantMultiSelect } from "@/features/variants";
import {
  IMAGE_RESOLUTIONS,
} from "@/lib/export-presets";
import { batchFilenamePrefix, batchRenderTargets, runBatchExportJobs } from "@/lib/variants/batch-export";
import { cn } from "@/lib/utils";
import { getHiresRefs } from "@/stores/hires-export-store";
import { BatchJobEstimate } from "./BatchJobEstimate";

type ExportMode = "single" | "multiple";

export function EditorImageTab(props: BatchExportTabProps) {
  const { sceneId, viewerId, modelConfig, variantItems } = props;
  // While server exports are on, stills render on the server (ADR 0005); else in this browser.
  const serverExports = useServerExports();
  const [mode, setMode] = useState<ExportMode>("single");
  const [options, setOptions] = useState<StillExportOptions>(DEFAULT_STILL_EXPORT);
  const batch = useBatchExport(props);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setStatus(null);
    const refs = getHiresRefs();
    if (!refs) {
      setError("Open a model first — the 3D scene must be loaded.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "single") {
        await exportStill(options, `${viewerId}-${stillExportLabel(options)}`);
        setStatus("Image downloaded");
        return;
      }

      if (!batch.batchExportEnabled) {
        setError("Batch export requires a plan upgrade.");
        return;
      }

      const jobs = await batch.buildJobs();

      if (jobs.length === 0) {
        setError("Select at least one variant or save variants in Settings.");
        return;
      }

      const tileResults: BatchTileResult[] = [];
      let completed = 0;

      await runBatchExportJobs(jobs, batch.batchContext, async (job) => {
        const label = batchFilenamePrefix(job);
        try {
          await exportStill(options, `${label}-${IMAGE_RESOLUTIONS[options.resolution].label}`);
          tileResults.push({ ok: true, label });
        } catch (e) {
          tileResults.push({
            ok: false,
            label,
            message: e instanceof Error ? e.message : "Render failed",
          });
        } finally {
          completed += 1;
          setStatus(`Batch ${completed}/${jobs.length}`);
        }
        return tileResults[tileResults.length - 1]!;
      });

      const failed = tileResults.filter((t) => !t.ok);
      setStatus(
        failed.length === 0
          ? `Downloaded ${tileResults.length} images`
          : `Finished ${tileResults.length} jobs — ${failed.length} failed`,
      );
      if (failed.length > 0) {
        setError(failed.map((f) => `${f.label}: ${f.message}`).join("; "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Image</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            High-resolution stills with viewport-matched bloom, AO, and color.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <CampaignPackLauncher modelId={viewerId} sceneId={sceneId} modelConfig={modelConfig} />
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Mode
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["single", "multiple"] as ExportMode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  mode === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {value === "single" ? "Single" : "Multiple"}
              </button>
            ))}
          </div>
          {mode === "multiple" ? (
            <p className="text-xs text-muted-foreground">
              Batch-export selected variants across this model and any additional models.
            </p>
          ) : null}
        </div>

        {mode === "multiple" ? (
          <>
            <VariantMultiSelect
              items={variantItems}
              selectedIds={batch.selectedVariantIds}
              onChange={batch.setSelectedVariantIds}
              disabled={busy}
            />
            <ModelMultiSelect
              currentSceneId={sceneId}
              selectedIds={batch.selectedSceneIds}
              onChange={batch.setSelectedSceneIds}
              disabled={busy}
            />
          </>
        ) : null}

        <StillExportSettings
          value={options}
          onChange={setOptions}
          jpegQualityMin={serverExports ? JOB_JPEG_QUALITY_MIN : undefined}
        />

        {serverExports ? (
          <ImageJobRender mode={mode} options={options} viewerId={viewerId} batch={batch} />
        ) : (
          <>
            {options.resolution === "8k" ? (
              <div
                className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400"
                role="note"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  8K requires significant GPU memory. Older devices may fail or stutter.
                </p>
              </div>
            ) : null}

            {mode === "multiple" ? (
              <BatchJobEstimate count={batch.estimatedJobCount} enabled={batch.batchExportEnabled} />
            ) : null}

            {/* Until the flag is read, neither way can start. */}
            <Button
              type="button"
              className="w-full gap-2"
              disabled={busy || serverExports === null || (mode === "multiple" && !batch.batchExportEnabled)}
              onClick={() => void handleExport()}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Rendering…
                </>
              ) : (
                <>
                  <Download className="size-4" aria-hidden />
                  {mode === "single" ? "Render & download" : `Render ${batch.estimatedJobCount} images`}
                </>
              )}
            </Button>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="text-xs text-muted-foreground" role="status">
                {status}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

type ImageJobRenderProps = {
  mode: ExportMode;
  options: StillExportOptions;
  viewerId: string;
  batch: BatchExport;
};

/**
 * The Images tab's Render on the server: one still of the live look, or in "Multiple" one per
 * scene and variant picked, in one bulk request, priced before it starts. The price says how
 * many images it makes, and offers the upgrade where the plan has no batch export.
 */
function ImageJobRender({ mode, options, viewerId, batch }: ImageJobRenderProps) {
  const exportScene = useExportScene();
  const { targets, error } = useBatchTargets(batch, mode === "multiple");
  const jobCount = targets?.length ?? batch.estimatedJobCount;

  /** The jobs a click starts, from the view as it is then. */
  function stillJobs(): RenderJobRequest[] | null {
    const camera = liveViewCamera();
    if (!exportScene || !camera) return null;
    const spec = stillJobSpec(options, camera);
    const look = exportScene.look();
    if (mode === "single") {
      return [stillJobRequest(spec, { sceneId: exportScene.sceneId, look, name: `${viewerId}-${stillExportLabel(options)}` })];
    }
    const size = IMAGE_RESOLUTIONS[options.resolution].label;
    return batchRenderTargets(targets ?? [], look, size).map((target) => stillJobRequest(spec, target));
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
        key={mode}
        requests={stillJobs}
        bulk={mode === "multiple"}
        disabled={mode === "multiple" && !batch.batchExportEnabled}
      >
        {mode === "single" ? "Render & download" : `Render ${outputsLabel("still", jobCount)}`}
      </RenderJobButton>
    </>
  );
}
