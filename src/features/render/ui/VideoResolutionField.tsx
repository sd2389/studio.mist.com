"use client";

import { Lock } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { fitsExportLimits } from "@/lib/export-limits";
import { VIDEO_RESOLUTIONS, type VideoResolutionId } from "@/lib/export-presets";
import { FREE_EXPORT_PLAN } from "../lib/export-plan";
import { ExportPlanNote } from "./ExportPlanNote";
import { useExportPlan } from "./useExportPlan";

/**
 * Video resolution chips, 720p to 8K. Sizes above the plan's cap (`max_image_resolution`:
 * Free tops out at 4K) are locked, with the upgrade prompt; the recorder refuses them too.
 */
export function VideoResolutionField({
  value,
  onChange,
  disabled,
  showSize = false,
}: {
  value: VideoResolutionId;
  onChange: (next: VideoResolutionId) => void;
  disabled?: boolean;
  /** "4K (3840x2160)" instead of "4K". */
  showSize?: boolean;
}) {
  const plan = useExportPlan();
  const limits = plan ?? FREE_EXPORT_PLAN;
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">Resolution</Label>
      <div className="flex flex-wrap gap-2">
        {VIDEO_RESOLUTIONS.map((r) => {
          const locked = !fitsExportLimits(limits, r.width, r.height);
          return (
            <Chip key={r.id} selected={value === r.id} onClick={() => onChange(r.id)} disabled={disabled || locked}>
              {showSize ? `${r.label} (${r.width}x${r.height})` : r.label}
              {locked ? (
                <>
                  <Lock className="size-3" aria-hidden />
                  <span className="sr-only">(needs a plan upgrade)</span>
                </>
              ) : null}
            </Chip>
          );
        })}
      </div>
      <ExportPlanNote plan={plan} />
    </div>
  );
}
