"use client";

import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_STILL_EXPORT,
  exportStill,
  JOB_JPEG_QUALITY_MIN,
  liveViewCamera,
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
import { computeImageSize, IMAGE_RESOLUTIONS } from "@/lib/export-presets";

type HiResExportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
};

export function HiResExportModal({ open, onOpenChange, modelId }: HiResExportModalProps) {
  // While server exports are on, the still renders on the server (ADR 0005); else in this browser.
  const serverExports = useServerExports();
  const exportScene = useExportScene();
  const [options, setOptions] = useState<StillExportOptions>(DEFAULT_STILL_EXPORT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width, height } = computeImageSize(options.resolution, options.aspect);

  async function handleRender() {
    setError(null);
    setBusy(true);
    try {
      await exportStill(options, `${modelId}-${stillExportLabel(options)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setBusy(false);
    }
  }

  /** The still job a Render click starts: the view as it is then, at the size and format picked. */
  function stillJob(): RenderJobRequest[] | null {
    const camera = liveViewCamera();
    if (!exportScene || !camera) return null;
    const name = `${modelId}-${stillExportLabel(options)}`;
    return [stillJobRequest(stillJobSpec(options, camera), { sceneId: exportScene.sceneId, look: exportScene.look(), name })];
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
            Render the current view{serverExports ? " on our servers" : null} at production resolution with the same bloom, ambient
            occlusion, and PBR Neutral tone mapping as the live viewport.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <StillExportSettings
            value={options}
            onChange={setOptions}
            jpegQualityMin={serverExports ? JOB_JPEG_QUALITY_MIN : undefined}
          />

          {serverExports ? (
            <>
              {exportScene ? null : (
                <p className="text-xs text-muted-foreground" role="note">
                  Stills render from a saved piece: open one of yours in the studio to render it.
                </p>
              )}
              <RenderJobButton requests={stillJob}>Render & download {options.format.toUpperCase()}</RenderJobButton>
            </>
          ) : (
            <>
              {options.resolution === "8k" ? (
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

              {/* Until the flag is read, neither way can start. */}
              <Button
                type="button"
                className="w-full gap-2"
                disabled={busy || serverExports === null}
                onClick={() => void handleRender()}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Rendering {IMAGE_RESOLUTIONS[options.resolution].label}…
                  </>
                ) : (
                  <>
                    <Download className="size-4" aria-hidden />
                    Render & download {options.format.toUpperCase()}
                  </>
                )}
              </Button>

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
