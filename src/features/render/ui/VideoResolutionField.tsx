"use client";

import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { fitsExportLimits } from "@/lib/export-limits";
import { VIDEO_RESOLUTIONS, type VideoResolutionId } from "@/lib/export-presets";
import { FREE_EXPORT_PLAN, fitsVideoSize } from "../lib/export-plan";
import { ExportPlanNote } from "./ExportPlanNote";
import { useExportPlan } from "./useExportPlan";

/**
 * Video resolution chips, 720p to 8K. Sizes above the plan's cap (`max_image_resolution`:
 * Free tops out at 4K) are locked, with the upgrade prompt; the recorder refuses them too. A
 * video rendered on the server also locks 8K where the plan has no 8K video, and the prompt
 * says how fast and long the plan's videos may be.
 */
export function VideoResolutionField({
  value,
  onChange,
  disabled,
  showSize = false,
  isServerExport = false,
}: {
  value: VideoResolutionId;
  onChange: (next: VideoResolutionId) => void;
  disabled?: boolean;
  /** "4K (3840x2160)" instead of "4K". */
  showSize?: boolean;
  /** The video renders on the server (ADR 0005), within the plan's video caps. */
  isServerExport?: boolean;
}) {
  const plan = useExportPlan();
  const limits = plan ?? FREE_EXPORT_PLAN;
  const fits = isServerExport ? fitsVideoSize : fitsExportLimits;
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">Resolution</Label>
      <div className="flex flex-wrap gap-2">
        {VIDEO_RESOLUTIONS.map((r) => (
          <Chip
            key={r.id}
            selected={value === r.id}
            onClick={() => onChange(r.id)}
            disabled={disabled}
            locked={!fits(limits, r.width, r.height)}
          >
            {showSize ? `${r.label} (${r.width}x${r.height})` : r.label}
          </Chip>
        ))}
      </div>
      <ExportPlanNote plan={plan} video={isServerExport} />
    </div>
  );
}
