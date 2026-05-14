"use client";

import { AlertTriangle, Loader2, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  isWebCodecsSupported,
  recordTurntable,
  ZIP_FALLBACK_MIME,
} from "@/lib/video-capture";
import { getVideoCaptureRefs } from "@/stores/video-capture-store";

type Video360ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
};

const RESOLUTIONS = [
  { id: "720p", label: "720p", width: 1280, height: 720 },
  { id: "1080p", label: "1080p", width: 1920, height: 1080 },
  { id: "4k", label: "4K", width: 3840, height: 2160 },
] as const;
type ResolutionId = (typeof RESOLUTIONS)[number]["id"];

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
        "disabled:opacity-50 disabled:pointer-events-none",
        selected && "border-primary/40 bg-primary/10 text-foreground ring-1 ring-primary/20",
      )}
    >
      {label}
    </button>
  );
}

export function Video360Modal({ open, onOpenChange, modelId }: Video360ModalProps) {
  const [resId, setResId] = useState<ResolutionId>("1080p");
  const [frames, setFrames] = useState<FrameCount>(120);
  const [fps, setFps] = useState<FpsOption>(30);
  const [bitrateId, setBitrateId] = useState<BitrateId>("med");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hasWebCodecs, setHasWebCodecs] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    setHasWebCodecs(isWebCodecsSupported());
  }, []);

  useEffect(() => {
    if (!open) {
      setProgress(0);
      setError(null);
      setStatus(null);
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  const resolution = RESOLUTIONS.find((r) => r.id === resId) ?? RESOLUTIONS[1];
  const bitrate = BITRATES.find((b) => b.id === bitrateId) ?? BITRATES[1];
  const durationSec = frames / fps;
  const bps = bytesPerSecondEstimate(resolution.width, resolution.height, fps, bitrate.multiplier);

  const estimatedTimeStr = useMemo(() => {
    if (!busy || progress <= 0.01) return null;
    const elapsed = (performance.now() - startedAtRef.current) / 1000;
    const total = elapsed / progress;
    const remaining = Math.max(0, total - elapsed);
    return `~${Math.round(remaining)}s remaining`;
  }, [busy, progress]);

  const fileSizeStr = useMemo(() => {
    const mb = (bps * durationSec) / 8 / 1024 / 1024;
    if (mb < 1) return `~${(mb * 1024).toFixed(0)} KB`;
    return `~${mb.toFixed(1)} MB`;
  }, [bps, durationSec]);

  async function handleRender() {
    setError(null);
    setStatus(null);
    setProgress(0);

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
      const blob = await recordTurntable({
        gl: refs.gl,
        scene: refs.scene,
        camera: refs.camera,
        width: resolution.width,
        height: resolution.height,
        frameCount: frames,
        fps,
        bitrate: bps,
        onProgress: (p) => setProgress(p),
        signal: controller.signal,
      });

      const isZip = blob.type === ZIP_FALLBACK_MIME;
      const ext = isZip ? "zip" : "mp4";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${modelId}-360.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus(
        isZip
          ? `Downloaded ZIP of ${frames} PNG frames (MP4 unavailable)`
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
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <div className="space-y-2">
            <Label className="text-muted-foreground">Resolution</Label>
            <div className="flex flex-wrap gap-2">
              {RESOLUTIONS.map((r) => (
                <ChipOption
                  key={r.id}
                  label={`${r.label} (${r.width}x${r.height})`}
                  selected={resId === r.id}
                  onClick={() => setResId(r.id)}
                  disabled={busy}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Frames</Label>
            <div className="flex flex-wrap gap-2">
              {FRAME_COUNTS.map((f) => (
                <ChipOption
                  key={f}
                  label={`${f} frames`}
                  selected={frames === f}
                  onClick={() => setFrames(f)}
                  disabled={busy}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">FPS</Label>
            <div className="flex flex-wrap gap-2">
              {FPS_OPTIONS.map((f) => (
                <ChipOption
                  key={f}
                  label={`${f} fps`}
                  selected={fps === f}
                  onClick={() => setFps(f)}
                  disabled={busy}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Bitrate</Label>
            <div className="flex flex-wrap gap-2">
              {BITRATES.map((b) => (
                <ChipOption
                  key={b.id}
                  label={b.label}
                  selected={bitrateId === b.id}
                  onClick={() => setBitrateId(b.id)}
                  disabled={busy}
                />
              ))}
            </div>
          </div>

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
                <span>{Math.round(progress * 100)}%</span>
                {estimatedTimeStr ? <span>{estimatedTimeStr}</span> : null}
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

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {busy ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className="border-border"
              >
                <X className="size-4" aria-hidden />
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
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
                  Rendering...
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
