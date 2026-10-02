"use client";

import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { readViewportBackdrop } from "@/lib/export-backdrop";
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
import { DEFAULT_JPEG_QUALITY, renderAtResolution } from "@/lib/offscreen-render";
import { cn } from "@/lib/utils";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { loadExportPlan } from "../lib/export-plan";
import { prepareCutoutScene } from "../lib/stage-visibility";
import { JpegQualityField } from "./JpegQualityField";

export type StillExportOptions = {
  resolution: ImageResolutionId;
  aspect: AspectId;
  format: ImageFormat;
  transparent: boolean;
  jpegQuality: number;
};

export const DEFAULT_STILL_EXPORT: StillExportOptions = {
  resolution: "4k",
  aspect: "16:9",
  format: "png",
  transparent: false,
  jpegQuality: DEFAULT_JPEG_QUALITY,
};

/** "4K-16x9": the resolution and aspect part of a still's file name. */
export function stillExportLabel(options: StillExportOptions): string {
  return `${IMAGE_RESOLUTIONS[options.resolution].label}-${options.aspect.replace(":", "x")}`;
}

/**
 * Render the current studio view at production resolution — same post-processing as the
 * viewport — and download it as `filename` plus the format's extension. The plan's limits
 * apply here, not only in the picker: a size above its cap is refused, Free gets the watermark.
 */
export async function exportStill(options: StillExportOptions, filename: string): Promise<void> {
  const plan = await loadExportPlan();
  const refs = getHiresRefs();
  if (!refs) throw new Error("Open a model first — the 3D scene must be loaded.");
  const { width, height } = computeImageSize(options.resolution, options.aspect);
  const { exposure, postfxConfig } = getRenderFidelity();
  const blob = await renderAtResolution({
    gl: refs.gl,
    scene: refs.scene,
    camera: refs.camera,
    width,
    height,
    transparent: options.transparent,
    exposure,
    postfxConfig,
    format: options.format,
    jpegQuality: options.jpegQuality,
    // JPEG has no alpha: transparent areas become white; otherwise flatten the CSS backdrop.
    backdrop: options.transparent ? null : readViewportBackdrop(refs.gl.domElement),
    // Cutouts are the piece alone: no studio set, no contact-shadow catcher.
    prepareScene: options.transparent ? prepareCutoutScene : undefined,
    limits: plan,
  });
  downloadBlob(blob, `${filename}.${extForImageFormat(options.format)}`);
}

const OPTION = "rounded-lg border px-3 py-2 text-sm font-medium transition-colors";
const optionState = (selected: boolean) =>
  selected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background hover:bg-muted";

function FieldTitle({ children }: { children: string }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{children}</p>;
}

/** Resolution, aspect, format, JPEG quality and transparency for a still, with its output estimate. */
export function StillExportSettings({
  value,
  onChange,
  allows8k = true,
}: {
  value: StillExportOptions;
  onChange: (next: StillExportOptions) => void;
  /** Plan gate; 8K renders need Grow or Studio. */
  allows8k?: boolean;
}) {
  const set = <K extends keyof StillExportOptions>(key: K, next: StillExportOptions[K]) => onChange({ ...value, [key]: next });
  const { width, height } = computeImageSize(value.resolution, value.aspect);
  const estimateBytes = width * height * (value.format === "jpeg" ? 2 : 4);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <FieldTitle>Resolution</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(IMAGE_RESOLUTIONS) as ImageResolutionId[]).map((id) => {
            const locked = id === "8k" && !allows8k;
            const size = computeImageSize(id, value.aspect);
            return (
              <button
                key={id}
                type="button"
                disabled={locked}
                onClick={() => set("resolution", id)}
                className={cn(OPTION, "text-left", locked && "cursor-not-allowed opacity-50", optionState(value.resolution === id))}
              >
                <span className="block">
                  {IMAGE_RESOLUTIONS[id].label}
                  {locked ? " · Pro" : ""}
                </span>
                <span className="block text-[10px] font-normal text-muted-foreground">
                  {size.width}×{size.height}
                </span>
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
        <FieldTitle>Aspect ratio</FieldTitle>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ASPECT_RATIO) as AspectId[]).map((id) => (
            <button key={id} type="button" onClick={() => set("aspect", id)} className={cn(OPTION, "text-center", optionState(value.aspect === id))}>
              {id}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <FieldTitle>Format</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          {(["png", "jpeg"] as ImageFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => set("format", format)}
              className={cn(OPTION, "text-center uppercase", optionState(value.format === format))}
            >
              {format}
            </button>
          ))}
        </div>
      </div>

      {value.format === "jpeg" ? <JpegQualityField value={value.jpegQuality} onChange={(q) => set("jpegQuality", q)} /> : null}

      <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
        <Label htmlFor="still-transparent" className="cursor-pointer text-xs">
          {value.format === "jpeg" ? "Transparent background (white in JPEG)" : "Transparent background"}
        </Label>
        <Switch id="still-transparent" checked={value.transparent} onCheckedChange={(t) => set("transparent", t)} />
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <span>
          Output: <span className="text-foreground">{width}×{height}</span>
        </span>
        <span>Est. {formatBytes(estimateBytes)}</span>
      </div>
    </div>
  );
}
