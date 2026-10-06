"use client";

import { ChipField } from "@/components/ui/chip";
import { FREE_EXPORT_PLAN, fitsVideoFps, JOB_VIDEO_MAX_FPS } from "../lib/export-plan";
import { useExportPlan } from "./useExportPlan";

/**
 * Video frame-rate chips. A video rendered on the server (ADR 0005) is offered no rate above
 * 60 fps, and rates above the plan's (Free: 30 fps) are locked; the API refuses them too. The
 * browser's recorder is offered every rate.
 */
export function VideoFpsField<Fps extends number>({
  options,
  value,
  onChange,
  disabled,
  isServerExport = false,
}: {
  options: readonly Fps[];
  value: Fps;
  onChange: (next: Fps) => void;
  disabled?: boolean;
  /** The video renders on the server, within the plan's video caps. */
  isServerExport?: boolean;
}) {
  const plan = useExportPlan() ?? FREE_EXPORT_PLAN;
  const offered = isServerExport ? options.filter((fps) => fps <= JOB_VIDEO_MAX_FPS) : options;
  return (
    <ChipField
      label="FPS"
      options={offered.map((fps) => ({ value: fps, label: `${fps} fps`, locked: isServerExport && !fitsVideoFps(plan, fps) }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
