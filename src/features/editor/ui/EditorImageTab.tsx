"use client";

import { AlertTriangle, Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ModelMultiSelect, VariantMultiSelect } from "@/features/variants";
import {
  ASPECT_RATIO,
  computeImageSize,
  downloadBlob,
  extForImageFormat,
  formatBytes,
  IMAGE_RESOLUTIONS,
  type AspectId,
  type ImageFormat,
  type ImageResolutionId,
} from "@/lib/export-presets";
import { renderAtResolution } from "@/lib/offscreen-render";
import {
  batchFilenamePrefix,
  buildBatchExportJobs,
  runBatchExportJobs,
  type BatchExportContext,
} from "@/lib/variants/batch-export";
import type { ModelVariant, SceneVariantsState } from "@/lib/variants/types";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { fetchBillingAccount } from "@/lib/billing/client";
import type { PlanFeatures } from "@/lib/billing/types";
import { cn } from "@/lib/utils";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import * as THREE from "three";

type ExportMode = "single" | "multiple";

type EditorImageTabProps = {
  sceneId: number;
  viewerId: string;
  modelUrl: string;
  modelConfig: PersistedModelConfig;
  variantsState: SceneVariantsState;
  variantItems: ModelVariant[];
  onModelConfigChange: (config: PersistedModelConfig) => void;
  setBatchModelUrl: (url: string | null) => void;
};

export function EditorImageTab({
  sceneId,
  viewerId,
  modelUrl,
  modelConfig,
  variantsState,
  variantItems,
  onModelConfigChange,
  setBatchModelUrl,
}: EditorImageTabProps) {
  const [mode, setMode] = useState<ExportMode>("single");
  const [resolution, setResolution] = useState<ImageResolutionId>("4k");
  const [aspect, setAspect] = useState<AspectId>("16:9");
  const [format, setFormat] = useState<ImageFormat>("png");
  const [transparent, setTransparent] = useState(false);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [planFeatures, setPlanFeatures] = useState<PlanFeatures | null>(null);

  useEffect(() => {
    fetchBillingAccount()
      .then((account) => setPlanFeatures(account.features))
      .catch(() => {});
  }, []);

  const allows8k = (planFeatures?.max_image_resolution ?? 4096) >= 8192;

  const { width, height } = useMemo(() => computeImageSize(resolution, aspect), [resolution, aspect]);
  const estimateBytes = useMemo(() => width * height * (format === "jpeg" ? 2 : 4), [width, height, format]);

  const batchContext: BatchExportContext = useMemo(
    () => ({
      sceneId,
      viewerId,
      modelUrl,
      modelConfig,
      variantsState,
      onModelConfigChange,
      setBatchModelUrl,
    }),
    [modelConfig, modelUrl, onModelConfigChange, sceneId, setBatchModelUrl, variantsState, viewerId],
  );

  async function renderCurrentView(filenameSuffix: string): Promise<void> {
    const refs = getHiresRefs();
    if (!refs) throw new Error("Open a model first — the 3D scene must be loaded.");

    const { exposure, postfxConfig } = getRenderFidelity();
    const blob = await renderAtResolution({
      gl: refs.gl,
      scene: refs.scene,
      camera: refs.camera,
      width,
      height,
      transparent,
      exposure,
      postfxConfig,
      format,
    });
    const ext = extForImageFormat(format);
    downloadBlob(blob, `${filenameSuffix}.${ext}`);
  }

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
        await renderCurrentView(
          `${viewerId}-${IMAGE_RESOLUTIONS[resolution].label}-${aspect.replace(":", "x")}`,
        );
        setStatus("Image downloaded");
        return;
      }

      const jobs = await buildBatchExportJobs({
        currentSceneId: sceneId,
        currentViewerId: viewerId,
        currentModelUrl: modelUrl,
        currentModelConfig: modelConfig,
        variantsState,
        selectedVariantIds,
        selectedSceneIds,
      });

      if (jobs.length === 0) {
        setError("Select at least one variant or save variants in Settings.");
        return;
      }

      await runBatchExportJobs(jobs, batchContext, async (job) => {
        const prefix = batchFilenamePrefix(job);
        await renderCurrentView(`${prefix}-${IMAGE_RESOLUTIONS[resolution].label}`);
      });

      setStatus(`Downloaded ${jobs.length} image${jobs.length === 1 ? "" : "s"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setBusy(false);
    }
  }

  const multipleCount =
    (selectedVariantIds.length || variantItems.length || 1) *
    (1 + selectedSceneIds.length);

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
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
              selectedIds={selectedVariantIds}
              onChange={setSelectedVariantIds}
              disabled={busy}
            />
            <ModelMultiSelect
              currentSceneId={sceneId}
              selectedIds={selectedSceneIds}
              onChange={setSelectedSceneIds}
              disabled={busy}
            />
          </>
        ) : null}

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Resolution
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(IMAGE_RESOLUTIONS) as ImageResolutionId[]).map((id) => {
              const locked = id === "8k" && !allows8k;
              const size = computeImageSize(id, aspect);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={locked}
                  onClick={() => !locked && setResolution(id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    locked && "cursor-not-allowed opacity-50",
                    resolution === id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-medium">
                    {IMAGE_RESOLUTIONS[id].label}
                    {locked ? " · Pro" : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {size.width}×{size.height}
                  </p>
                </button>
              );
            })}
          </div>
          {!allows8k ? (
            <p className="text-xs text-muted-foreground">
              8K exports require Grow or Studio.{" "}
              <Link href="/pricing" className="text-primary hover:underline">
                Upgrade
              </Link>
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Aspect ratio
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ASPECT_RATIO) as AspectId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setAspect(id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors",
                  aspect === id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Format
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["png", "jpeg"] as ImageFormat[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormat(value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-center text-sm font-medium uppercase transition-colors",
                  format === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
          <Label htmlFor="image-transparent" className="cursor-pointer text-xs">
            Transparent background
          </Label>
          <Switch
            id="image-transparent"
            checked={transparent}
            onCheckedChange={setTransparent}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span>
            Output: <span className="text-foreground">{width}×{height}</span>
          </span>
          <span>Est. {formatBytes(estimateBytes)}</span>
        </div>

        {resolution === "8k" ? (
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

        <Button
          type="button"
          className="w-full gap-2"
          disabled={busy}
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
              {mode === "single" ? "Render & download" : `Render ${multipleCount} images`}
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
      </div>
    </div>
  );
}
