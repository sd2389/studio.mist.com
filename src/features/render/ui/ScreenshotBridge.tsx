"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { pixelRatioWithinLimits, type ExportLimits } from "@/lib/export-limits";
import { drawExportWatermark } from "@/lib/export-watermark";
import { renderWithPostFX } from "@/lib/viewer-postfx-pipeline";
import { getPostFXComposerRefs } from "@/stores/postfx-composer-store";
import { useScreenshotStore } from "@/stores/screenshot-store";

/** The live canvas as an exported PNG: scaled into the plan's cap, watermarked when it asks. */
function exportPngDataUrl(source: HTMLCanvasElement, limits: ExportLimits): string {
  const scale = pixelRatioWithinLimits(limits, source.width, source.height, 1);
  if (scale >= 1 && !limits.watermark) return source.toDataURL("image/png");
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(source.width * scale);
  canvas.height = Math.floor(source.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for export");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (limits.watermark) drawExportWatermark(ctx, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Registers canvas capture with the global screenshot store (must live inside `<Canvas>`). */
export function ScreenshotBridge() {
  const gl = useThree((state) => state.gl);
  const setCaptureFn = useScreenshotStore((state) => state.setCaptureFn);

  useEffect(() => {
    setCaptureFn((limits) => {
      const postfx = getPostFXComposerRefs();
      if (postfx) renderWithPostFX(postfx.composer);
      const source = postfx ? postfx.gl.domElement : gl.domElement;
      return limits ? exportPngDataUrl(source, limits) : source.toDataURL("image/png");
    });
    return () => setCaptureFn(null);
  }, [gl, setCaptureFn]);

  return null;
}
