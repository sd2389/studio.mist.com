"use client";

import {
  Camera,
  Maximize2,
  Minimize2,
  Move3d,
  RotateCw,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { zoomToFactor } from "@/stores/orbit-controls-store";
import { captureFrameToDataUrl } from "@/stores/screenshot-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

type ViewportControlsProps = {
  onScreenshot?: (dataUrl: string) => void;
  className?: string;
};

export function ViewportControls({ onScreenshot, className }: ViewportControlsProps) {
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const setAutoRotate = useMaterialPresetStore((s) => s.setAutoRotate);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    function onFsChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleScreenshot = useCallback(() => {
    const dataUrl = captureFrameToDataUrl();
    if (dataUrl) onScreenshot?.(dataUrl);
  }, [onScreenshot]);

  const handleResetView = useCallback(() => {
    zoomToFactor(1);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-4 top-4 z-30 flex flex-col gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-md backdrop-blur",
        className,
      )}
      role="toolbar"
      aria-label="Viewport controls"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleScreenshot}
        aria-label="Capture screenshot"
        title="Screenshot"
      >
        <Camera className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Open Position tab"
        title="Position — use the Position tab in the editor rail"
      >
        <Move3d className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant={autoRotate ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => setAutoRotate(!autoRotate)}
        aria-label={autoRotate ? "Disable auto-rotate" : "Enable auto-rotate"}
        title="Auto-rotate"
      >
        <RotateCw className={cn("size-4", autoRotate && "text-primary")} aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleResetView}
        aria-label="Reset view"
        title="Reset view"
      >
        <RotateCcw className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => void toggleFullscreen()}
        aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {fullscreen ? (
          <Minimize2 className="size-4" aria-hidden />
        ) : (
          <Maximize2 className="size-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}
