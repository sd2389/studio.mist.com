"use client";

import { AlertTriangle, Loader2, Video, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CaptureNotice,
  turntableCaptureOptions,
  useCaptureRun,
  VideoResolutionField,
  videoSizeLabel,
} from "@/features/render";
import { downloadBlob, VIDEO_RESOLUTIONS, type VideoResolutionId } from "@/lib/export-presets";
import { isWebCodecsSupported, recordTurntable } from "@/lib/video-capture";
import { withLiveRenderingPaused } from "@/stores/hires-export-store";
import { getVideoCaptureRefs } from "@/stores/video-capture-store";
import { ChipField } from "@/components/ui/chip";

type Video360ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
};

const FRAME_COUNTS = [60, 120, 240] as const;
type FrameCount = (typeof FRAME_COUNTS)[number];

const FPS_OPTIONS = [24, 30, 60] as const;
type FpsOption = (typeof FPS_OPTIONS)[number];

const BITRATES = [
  { id: "low", label: "Standard", multiplier: 0.06 },
  { id: "med", label: "High", multiplier: 0.12 },
  { id: "high", label: "Max", multiplier: 0.22 },
] as const;
type BitrateId = (typeof BITRATES)[number]["id"];

function bytesPerSecondEstimate(width: number, height: number, fps: number, mult: number) {
  return Math.round(width * height * fps * mult);
}

export function Video360Modal({ open, onOpenChange, modelId }: Video360ModalProps) {
  const [resId, setResId] = useState<VideoResolutionId>("1080p");
  const [frames, setFrames] = useState<FrameCount>(120);
  const [fps, setFps] = useState<FpsOption>(30);
  const [bitrateId, setBitrateId] = useState<BitrateId>("med");
  const run = useCaptureRun();
  const { busy, progress, error, status, notice, etaLabel, reset, cancel } = run;
  const [hasWebCodecs] = useState(() => isWebCodecsSupported());

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        reset();
        cancel();
      }
      onOpenChange(next);
    },
    [cancel, onOpenChange, reset],
  );

  const resolution = VIDEO_RESOLUTIONS.find((r) => r.id === resId) ?? VIDEO_RESOLUTIONS[1];
  const bitrate = BITRATES.find((b) => b.id === bitrateId) ?? BITRATES[1];
  const durationSec = frames / fps;
  const bps = bytesPerSecondEstimate(resolution.width, resolution.height, fps, bitrate.multiplier);

  const fileSizeStr = videoSizeLabel(bps, durationSec);

  async function handleRender() {
    reset();

    const refs = getVideoCaptureRefs();
    if (!refs) {
      run.setError("3D view not ready — wait for the model to load, then try again.");
      return;
    }

    await run.capture(async (signal, onProgress) => {
      const settings = { width: resolution.width, height: resolution.height, frameCount: frames, fps, bitrate: bps };
      const options = await turntableCaptureOptions(settings, signal, onProgress);
      const result = await withLiveRenderingPaused(() => recordTurntable(options));

      const isZip = result.kind === "png-zip";
      downloadBlob(result.blob, `${modelId}-360.${isZip ? "zip" : "mp4"}`);
      run.setNotice(result.notice);
      run.setStatus(
        isZip
          ? `Downloaded ZIP of ${frames} PNG frames`
          : `Downloaded MP4 (${(result.blob.size / 1024 / 1024).toFixed(1)} MB · ${result.codec})`,
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
            <Video className="size-5 text-primary" aria-hidden />
            360 turntable
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Render a full orbit of the current scene to MP4. Scene: {" "}
            <span className="text-foreground/80">{modelId}</span>
          </DialogDescription>
        </DialogHeader>

        {!hasWebCodecs ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground/90">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <p>
              WebCodecs not available in this browser. Will export a ZIP of PNG frames instead.
              Try Chrome 94+ or Edge for MP4 output.
            </p>
          </div>
        ) : null}

        <div className="space-y-4">
          <VideoResolutionField value={resId} onChange={setResId} disabled={busy} showSize />

          <ChipField
            label="Frames"
            options={FRAME_COUNTS.map((f) => ({ value: f, label: `${f} frames` }))}
            value={frames}
            onChange={setFrames}
            disabled={busy}
          />

          <ChipField
            label="FPS"
            options={FPS_OPTIONS.map((f) => ({ value: f, label: `${f} fps` }))}
            value={fps}
            onChange={setFps}
            disabled={busy}
          />

          <ChipField
            label="Bitrate"
            options={BITRATES.map((b) => ({ value: b.id, label: b.label }))}
            value={bitrateId}
            onChange={setBitrateId}
            disabled={busy}
          />

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
              <p className="text-foreground">{durationSec.toFixed(2)}s</p>
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
                <span role="status">Recording… {Math.round(progress * 100)}%</span>
                {etaLabel ? <span>{etaLabel}</span> : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
              {!busy ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-border"
                  onClick={() => {
                    run.setError(null);
                    void handleRender();
                  }}
                >
                  <Video className="size-4" aria-hidden />
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
          <CaptureNotice message={notice} />
          {status ? (
            <p className="text-xs text-muted-foreground" role="status">
              {status}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {busy ? (
              <Button
                type="button"
                variant="outline"
                onClick={cancel}
                className="border-border"
              >
                <X className="size-4" aria-hidden />
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
                className="border-border"
              >
                Close
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void handleRender()}
              disabled={busy}
              className="gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Recording… {Math.round(progress * 100)}%
                </>
              ) : (
                <>
                  <Video className="size-4" aria-hidden />
                  Render video
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
