"use client";

import { AlertTriangle, Loader2, Video, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModelMultiSelect, VariantMultiSelect } from "@/features/variants";
import {
  VIDEO_FPS_OPTIONS,
  VIDEO_RESOLUTIONS,
  downloadBlob,
  type VideoFps,
  type VideoResolutionId,
} from "@/lib/export-presets";
import {
  batchFilenamePrefix,
  buildBatchExportJobs,
  estimateBatchJobCount,
  runBatchExportJobs,
  type BatchExportContext,
} from "@/lib/variants/batch-export";
import {
  isWebCodecsSupported,
  recordMultiAngle,
  recordTurntable,
  ZIP_FALLBACK_MIME,
  type CameraPose,
} from "@/lib/video-capture";
import type { ModelVariant, SceneVariantsState } from "@/lib/variants/types";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { mergePoses } from "@/lib/viewer-scene";
import { fetchBillingAccount } from "@/lib/billing/client";
import type { PlanFeatures } from "@/lib/billing/types";
import { cn } from "@/lib/utils";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { getVideoCaptureRefs } from "@/stores/video-capture-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

type VideoMode = "simple" | "multi-angle" | "multiple";

type BatchTileResult =
  | { ok: true; label: string }
  | { ok: false; label: string; message: string };

type EditorVideoTabProps = {
  sceneId: number;
  viewerId: string;
  modelUrl: string;
  modelConfig: PersistedModelConfig;
  variantsState: SceneVariantsState;
  variantItems: ModelVariant[];
  onModelConfigChange: (config: PersistedModelConfig) => void;
  setBatchModelUrl: (url: string | null) => void;
};

function ChipOption({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        "border-border bg-card text-foreground/90",
        "hover:border-primary/30 hover:bg-muted/80",
        "disabled:pointer-events-none disabled:opacity-50",
        selected && "border-primary/40 bg-primary/10 text-foreground ring-1 ring-primary/20",
      )}
    >
      {label}
    </button>
  );
}

export function EditorVideoTab({
  sceneId,
  viewerId,
  modelUrl,
  modelConfig,
  variantsState,
  variantItems,
  onModelConfigChange,
  setBatchModelUrl,
}: EditorVideoTabProps) {
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const poses = useMemo(() => mergePoses(sceneSettings.poses), [sceneSettings.poses]);
  const poseAngles: CameraPose[] = useMemo(
    () =>
      poses.map((pose) => ({
        cameraPosition: pose.cameraPosition,
        target: pose.target,
      })),
    [poses],
  );

  const [mode, setMode] = useState<VideoMode>("simple");
  const [resId, setResId] = useState<VideoResolutionId>("1080p");
  const [durationSec, setDurationSec] = useState("4");
  const [fps, setFps] = useState<VideoFps>(30);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hasWebCodecs] = useState(() => isWebCodecsSupported());
  const [etaLabel, setEtaLabel] = useState<string | null>(null);
  const [planFeatures, setPlanFeatures] = useState<PlanFeatures | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    fetchBillingAccount()
      .then((account) => setPlanFeatures(account.features))
      .catch(() => {});
  }, []);

  const batchExportEnabled = planFeatures?.batch_export_enabled !== false;
  const resolution = VIDEO_RESOLUTIONS.find((r) => r.id === resId) ?? VIDEO_RESOLUTIONS[1];
  const duration = Math.max(1, Number.parseFloat(durationSec) || 4);
  const frameCount = Math.max(1, Math.round(duration * fps));
  const bps = Math.round(resolution.width * resolution.height * fps * 0.12);

  const estimatedJobCount = useMemo(
    () =>
      estimateBatchJobCount({
        selectedVariantCount: selectedVariantIds.length,
        variantsStateItemCount: variantItems.length,
        extraSelectedSceneCount: selectedSceneIds.length,
      }),
    [selectedSceneIds.length, selectedVariantIds.length, variantItems.length],
  );

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

  const fileSizeStr = useMemo(() => {
    const mb = (bps * duration) / 8 / 1024 / 1024;
    if (mb < 1) return `~${(mb * 1024).toFixed(0)} KB`;
    return `~${mb.toFixed(1)} MB`;
  }, [bps, duration]);

  async function renderTurntableBlob(signal: AbortSignal): Promise<Blob> {
    const refs = getVideoCaptureRefs();
    if (!refs) throw new Error("Viewer not ready. Wait for the model to load.");

    const { exposure, postfxConfig } = getRenderFidelity();
    return recordTurntable({
      gl: refs.gl,
      scene: refs.scene,
      camera: refs.camera,
      width: resolution.width,
      height: resolution.height,
      frameCount,
      fps,
      bitrate: bps,
      exposure,
      postfxConfig,
      onProgress: (p: number) => {
        setProgress(p);
        const start = startedAtRef.current;
        if (p > 0.01 && start > 0) {
          const elapsed = (performance.now() - start) / 1000;
          const total = elapsed / p;
          const remaining = Math.max(0, total - elapsed);
          setEtaLabel(`~${Math.round(remaining)}s remaining`);
        }
      },
      signal,
    });
  }

  async function handleRender() {
    setError(null);
    setStatus(null);
    setProgress(0);
    setEtaLabel(null);

    const refs = getVideoCaptureRefs();
    if (!refs) {
      setError("Viewer not ready. Wait for the model to load.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    startedAtRef.current = performance.now();
    setBusy(true);

    try {
      const { exposure, postfxConfig } = getRenderFidelity();
      const baseOpts = {
        gl: refs.gl,
        scene: refs.scene,
        camera: refs.camera,
        width: resolution.width,
        height: resolution.height,
        frameCount,
        fps,
        bitrate: bps,
        exposure,
        postfxConfig,
        onProgress: (p: number) => {
          setProgress(p);
          const start = startedAtRef.current;
          if (p > 0.01 && start > 0) {
            const elapsed = (performance.now() - start) / 1000;
            const total = elapsed / p;
            const remaining = Math.max(0, total - elapsed);
            setEtaLabel(`~${Math.round(remaining)}s remaining`);
          }
        },
        signal: controller.signal,
      };

      if (mode === "multiple") {
        if (!batchExportEnabled) {
          setError("Batch export requires a plan upgrade.");
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

        const tileResults: BatchTileResult[] = [];
        let completed = 0;

        await runBatchExportJobs(jobs, batchContext, async (job) => {
          const label = batchFilenamePrefix(job);
          try {
            const blob = await renderTurntableBlob(controller.signal);
            const isZip = blob.type === ZIP_FALLBACK_MIME;
            const ext = isZip ? "zip" : "mp4";
            downloadBlob(blob, `${label}-360.${ext}`);
            tileResults.push({ ok: true, label });
          } catch (e) {
            if ((e as { name?: string })?.name === "AbortError") throw e;
            tileResults.push({
              ok: false,
              label,
              message: e instanceof Error ? e.message : "Render failed",
            });
          } finally {
            completed += 1;
            setProgress(completed / jobs.length);
            setStatus(`Batch ${completed}/${jobs.length}`);
          }
          return tileResults[tileResults.length - 1]!;
        });

        const failed = tileResults.filter((t) => !t.ok);
        setStatus(
          failed.length === 0
            ? `Downloaded ${tileResults.length} videos`
            : `Finished ${tileResults.length} jobs — ${failed.length} failed`,
        );
        if (failed.length > 0) {
          setError(failed.map((f) => `${f.label}: ${f.message}`).join("; "));
        }
        return;
      }

      const blob =
        mode === "multi-angle"
          ? await recordMultiAngle({ ...baseOpts, poses: poseAngles })
          : await recordTurntable(baseOpts);

      const isZip = blob.type === ZIP_FALLBACK_MIME;
      const ext = isZip ? "zip" : "mp4";
      const suffix = mode === "multi-angle" ? "multi-angle" : "360";
      downloadBlob(blob, `${viewerId}-${suffix}.${ext}`);
      setStatus(
        isZip
          ? `Downloaded ZIP of ${frameCount} PNG frames (MP4 unavailable)`
          : `Downloaded ${ext.toUpperCase()} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`,
      );
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") {
        setStatus("Cancelled");
      } else {
        setError(e instanceof Error ? e.message : "Render failed");
      }
    } finally {
      setBusy(false);
      setEtaLabel(null);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Video</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Turntable orbit, multi-angle cuts, or batch across variants and models.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!hasWebCodecs ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground/90">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <p>
              WebCodecs not available. Will export a ZIP of PNG frames instead. Try Chrome 94+ for
              MP4 output.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Mode
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "simple" as const, label: "Simple" },
                { id: "multi-angle" as const, label: "Multi-angle" },
                { id: "multiple" as const, label: "Multiple" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                disabled={busy}
                className={cn(
                  "rounded-lg border px-2 py-2 text-left text-xs transition-colors",
                  mode === item.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {mode === "multi-angle" ? (
            <p className="text-xs text-muted-foreground">
              Cycles through {poses.length} saved poses over {duration.toFixed(1)}s.
            </p>
          ) : null}
          {mode === "multiple" ? (
            <p className="text-xs text-muted-foreground">
              Renders a turntable video per selected variant and model.
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
          <Label className="text-muted-foreground">Resolution</Label>
          <div className="flex flex-wrap gap-2">
            {VIDEO_RESOLUTIONS.map((r) => (
              <ChipOption
                key={r.id}
                label={`${r.label}`}
                selected={resId === r.id}
                onClick={() => setResId(r.id)}
                disabled={busy}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-duration" className="text-muted-foreground">
            Duration (seconds)
          </Label>
          <Input
            id="video-duration"
            type="number"
            min={1}
            max={60}
            step={0.5}
            value={durationSec}
            onChange={(event) => setDurationSec(event.target.value)}
            disabled={busy}
            className="h-9 text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">FPS</Label>
          <div className="flex flex-wrap gap-2">
            {VIDEO_FPS_OPTIONS.map((value) => (
              <ChipOption
                key={value}
                label={`${value} fps`}
                selected={fps === value}
                onClick={() => setFps(value)}
                disabled={busy}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Frames</p>
            <p className="text-foreground">{frameCount}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Est. size</p>
            <p className="text-foreground">{fileSizeStr}</p>
          </div>
        </div>

        {busy ? (
          <div className="space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{Math.round(progress * 100)}%</span>
              {etaLabel ? <span>{etaLabel}</span> : null}
            </div>
          </div>
        ) : null}

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

        <div className="flex flex-col gap-2">
          {mode === "multiple" ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Estimated jobs:{" "}
                <span className="font-medium text-foreground">{estimatedJobCount}</span>
              </p>
              {!batchExportEnabled ? (
                <p className="text-destructive">
                  Batch export requires a plan upgrade.{" "}
                  <Link href="/pricing" className="text-primary hover:underline">
                    Upgrade
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
          {busy ? (
            <Button type="button" variant="outline" onClick={handleCancel} className="gap-2">
              <X className="size-4" aria-hidden />
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => void handleRender()}
            disabled={busy || (mode === "multiple" && !batchExportEnabled)}
            className="gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Rendering…
              </>
            ) : (
              <>
                <Video className="size-4" aria-hidden />
                {mode === "multiple" ? `Render ${estimatedJobCount} videos` : "Render video"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
