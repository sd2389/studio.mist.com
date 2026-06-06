"use client";

import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { renderAtResolution } from "@/lib/offscreen-render";
import { cn } from "@/lib/utils";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";

type ResolutionId = "1080p" | "4k" | "8k";
type AspectId = "16:9" | "1:1" | "4:3";

const BASE_HEIGHTS: Record<ResolutionId, number> = {
  "1080p": 1080,
  "4k": 2160,
  "8k": 4320,
};

const RESOLUTION_LABEL: Record<ResolutionId, string> = {
  "1080p": "1080p",
  "4k": "4K",
  "8k": "8K",
};

const ASPECT_RATIO: Record<AspectId, number> = {
  "16:9": 16 / 9,
  "1:1": 1,
  "4:3": 4 / 3,
};

function computeSize(res: ResolutionId, aspect: AspectId): { width: number; height: number } {
  const height = BASE_HEIGHTS[res];
  const width = Math.round(height * ASPECT_RATIO[aspect]);
  return { width, height };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `~${Math.round(bytes / 1024)} KB`;
  return `~${bytes} B`;
}

type HiResExportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
};

export function HiResExportModal({ open, onOpenChange, modelId }: HiResExportModalProps) {
  const [resolution, setResolution] = useState<ResolutionId>("4k");
  const [aspect, setAspect] = useState<AspectId>("16:9");
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { width, height } = useMemo(() => computeSize(resolution, aspect), [resolution, aspect]);
  const estimateBytes = useMemo(() => width * height * 4, [width, height]);

  async function handleRender() {
    setError(null);
    const refs = getHiresRefs();
    if (!refs) {
      setError("Open a model first — the 3D scene must be loaded.");
      return;
    }

    setBusy(true);
    try {
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
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${modelId}-${RESOLUTION_LABEL[resolution]}-${aspect.replace(":", "x")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
            <Download className="size-5 text-primary" aria-hidden />
            High-resolution export
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Render the current view at production resolution with the same bloom, ambient
            occlusion, and ACES color pipeline as the live viewport.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Resolution
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(BASE_HEIGHTS) as ResolutionId[]).map((r) => {
                const size = computeSize(r, aspect);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setResolution(r)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      resolution === r
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    <p className="text-sm font-medium">{RESOLUTION_LABEL[r]}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {size.width}×{size.height}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Aspect ratio
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(ASPECT_RATIO) as AspectId[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspect(a)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors",
                    aspect === a
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
            <Label htmlFor="hires-transparent" className="cursor-pointer">
              Transparent background
            </Label>
            <Switch
              id="hires-transparent"
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
                8K requires significant GPU memory ({width}×{height} ≈{" "}
                {((width * height * 4) / (1024 * 1024)).toFixed(0)} MB framebuffer). Older devices
                may fail or stutter.
              </p>
            </div>
          ) : null}

          <Button
            type="button"
            className="w-full gap-2"
            disabled={busy}
            onClick={() => void handleRender()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Rendering {RESOLUTION_LABEL[resolution]}…
              </>
            ) : (
              <>
                <Download className="size-4" aria-hidden />
                Render & download PNG
              </>
            )}
          </Button>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
