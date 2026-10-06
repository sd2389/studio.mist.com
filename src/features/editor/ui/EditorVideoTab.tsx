"use client";

import { AlertTriangle, Loader2, Video, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBatchExport, type BatchExportTabProps } from "@/features/editor/hooks/useBatchExport";
import { useVideoExport, type VideoMode } from "@/features/editor/hooks/useVideoExport";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CampaignPackLauncher,
  CaptureNotice,
  FREE_EXPORT_PLAN,
  maxVideoSeconds,
  useExportPlan,
  useServerExports,
  VideoFpsField,
  VideoResolutionField,
  videoSizeLabel,
} from "@/features/render";
import { ModelMultiSelect, VariantMultiSelect } from "@/features/variants";
import {
  VIDEO_FPS_OPTIONS,
  VIDEO_RESOLUTIONS,
  type VideoFps,
  type VideoResolutionId,
} from "@/lib/export-presets";
import { isWebCodecsSupported, type CameraPose } from "@/lib/video-capture";
import { mergePoses } from "@/lib/viewer-scene";
import { cn } from "@/lib/utils";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { BatchJobEstimate } from "./BatchJobEstimate";
import { VideoJobRender } from "./VideoJobRender";

/** The duration field's longest video, in seconds. */
const LONGEST_DURATION_SECONDS = 60;

export function EditorVideoTab(props: BatchExportTabProps) {
  const { sceneId, viewerId, modelConfig, variantItems } = props;
  // While server exports are on, videos render on the server (ADR 0005); else in this browser.
  const serverExports = useServerExports();
  const plan = useExportPlan();
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
  const batch = useBatchExport(props);
  const [hasWebCodecs] = useState(() => isWebCodecsSupported());

  const resolution = VIDEO_RESOLUTIONS.find((r) => r.id === resId) ?? VIDEO_RESOLUTIONS[1];
  const duration = Math.max(1, Number.parseFloat(durationSec) || 4);
  const frameCount = Math.max(1, Math.round(duration * fps));
  const bps = Math.round(resolution.width * resolution.height * fps * 0.12);
  // A server video is as long as the plan lets it be at this size (Free: 20 s); the API refuses longer.
  const longestDuration = serverExports
    ? Math.max(1, Math.min(LONGEST_DURATION_SECONDS, maxVideoSeconds(plan ?? FREE_EXPORT_PLAN, resolution.width, resolution.height)))
    : LONGEST_DURATION_SECONDS;

  const fileSizeStr = videoSizeLabel(bps, duration);

  const video = useVideoExport({
    mode,
    settings: { width: resolution.width, height: resolution.height, frameCount, fps, bitrate: bps },
    poseAngles,
    viewerId,
    batch,
  });
  const { busy, progress, error, status, notice, etaLabel } = video;

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
        <CampaignPackLauncher modelId={viewerId} sceneId={sceneId} modelConfig={modelConfig} />
        {/* The server encodes the MP4, so this browser's encoder doesn't matter there. */}
        {!serverExports && !hasWebCodecs ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground/90">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <p>
              WebCodecs not available. Will export a ZIP of PNG frames instead. Try Chrome 94+ for
              MP4 output.
            </p>
          </div>
        ) : null}

        <VideoModePicker
          mode={mode}
          onModeChange={setMode}
          disabled={busy}
          poseCount={poses.length}
          duration={duration}
        />

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

        <VideoResolutionField value={resId} onChange={setResId} disabled={busy} isServerExport={serverExports === true} />

        <div className="space-y-2">
          <Label htmlFor="video-duration" className="text-muted-foreground">
            Duration (seconds)
          </Label>
          <Input
            id="video-duration"
            type="number"
            min={1}
            max={longestDuration}
            step={0.5}
            value={durationSec}
            onChange={(event) => setDurationSec(event.target.value)}
            disabled={busy}
            className="h-9 text-xs"
          />
        </div>

        <VideoFpsField
          options={VIDEO_FPS_OPTIONS}
          value={fps}
          onChange={setFps}
          disabled={busy}
          isServerExport={serverExports === true}
        />

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

        {serverExports ? (
          <VideoJobRender
            mode={mode}
            settings={{ width: resolution.width, height: resolution.height, fps, frames: frameCount, quality: "high" }}
            poses={poses}
            viewerId={viewerId}
            batch={batch}
          />
        ) : (
          <>
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
            <CaptureNotice message={notice} />
            {status ? (
              <p className="text-xs text-muted-foreground" role="status">
                {status}
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              {mode === "multiple" ? (
                <BatchJobEstimate count={batch.estimatedJobCount} enabled={batch.batchExportEnabled} />
              ) : null}
              {busy ? (
                <Button type="button" variant="outline" onClick={video.cancel} className="gap-2">
                  <X className="size-4" aria-hidden />
                  Cancel
                </Button>
              ) : null}
              {/* Until the flag is read, neither way can start. */}
              <Button
                type="button"
                onClick={() => void video.render()}
                disabled={busy || serverExports === null || (mode === "multiple" && !batch.batchExportEnabled)}
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
                    {mode === "multiple" ? `Render ${batch.estimatedJobCount} videos` : "Render video"}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type VideoModePickerProps = {
  mode: VideoMode;
  onModeChange: (mode: VideoMode) => void;
  disabled: boolean;
  poseCount: number;
  duration: number;
};

/** Simple, Multi-angle or Multiple, with a line on what the two longer modes record. */
function VideoModePicker({ mode, onModeChange, disabled, poseCount, duration }: VideoModePickerProps) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
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
            onClick={() => onModeChange(item.id)}
            disabled={disabled}
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
          Cycles through {poseCount} saved poses over {duration.toFixed(1)}s.
        </p>
      ) : null}
      {mode === "multiple" ? (
        <p className="text-xs text-muted-foreground">
          Renders a turntable video per selected variant and model.
        </p>
      ) : null}
    </div>
  );
}
