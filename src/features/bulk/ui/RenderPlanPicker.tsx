"use client";

import { Chip, ChipField } from "@/components/ui/chip";
import {
  creditsLabel,
  FREE_EXPORT_PLAN,
  jobKindLabel,
  maxVideoSeconds,
  PACK_STILL_SIZES,
  PackAnglePicker,
  PackSection,
  RenderJobError,
  TURNTABLE_FORMAT_ORDER,
  TURNTABLE_FORMATS,
  ToggleRow,
  useExportPlan,
  VideoFpsField,
} from "@/features/render";
import type { RenderPlan } from "@/lib/api/ingest";
import { DEFAULT_SPIN, DEFAULT_TURNTABLE, TURNTABLE_FPS, TURNTABLE_SECONDS, withStillAngles } from "../domain/render-plan";
import { panelLabel } from "./BatchPlanPanel";
import type { RenderPlanChoice } from "./useRenderPlanChoice";

type PickerProps = { plan: RenderPlan; onChange: (next: RenderPlan) => void; disabled?: boolean };

function StillOptions({ plan, onChange, disabled }: PickerProps) {
  const stills = plan.stills;
  return (
    <>
      <PackAnglePicker
        value={stills?.angles ?? []}
        savedPoses={[]}
        onChange={(angles) => onChange(withStillAngles(plan, angles))}
        disabled={disabled}
      />
      {stills ? (
        <PackSection title="Stills" aside={plan.thumbnail_from ? `the ${plan.thumbnail_from} one becomes the thumbnail` : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {PACK_STILL_SIZES.map((size) => (
              <Chip key={size} selected={stills.size === size} onClick={() => onChange({ ...plan, stills: { ...stills, size } })} disabled={disabled}>
                {size}×{size}
              </Chip>
            ))}
            <Chip
              selected={stills.format === "png"}
              onClick={() => onChange({ ...plan, stills: { ...stills, format: stills.format === "png" ? "jpeg" : "png" } })}
              disabled={disabled}
              title="PNG instead of JPEG"
            >
              PNG
            </Chip>
          </div>
        </PackSection>
      ) : null}
    </>
  );
}

function TurntableOptions({ plan, onChange, disabled }: PickerProps) {
  const exportPlan = useExportPlan() ?? FREE_EXPORT_PLAN;
  const turntable = plan.turntable;
  const set = (next: Partial<typeof DEFAULT_TURNTABLE>) => turntable && onChange({ ...plan, turntable: { ...turntable, ...next } });
  const longest = turntable ? maxVideoSeconds(exportPlan, turntable.width, turntable.height) : 0;
  return (
    <ToggleRow
      id="render-plan-turntable"
      label={turntable ? `360° turntable MP4 · ${turntable.seconds}s` : "360° turntable MP4"}
      hint="Once round the piece from the three-quarter angle, H.264."
      checked={turntable !== null}
      onCheckedChange={(on) => onChange({ ...plan, turntable: on ? DEFAULT_TURNTABLE : null })}
      disabled={disabled}
    >
      {turntable ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {TURNTABLE_FORMAT_ORDER.map((format) => {
              const { width, height, label } = TURNTABLE_FORMATS[format];
              return (
                <Chip
                  key={format}
                  selected={turntable.width === width && turntable.height === height}
                  onClick={() => set({ width, height })}
                  disabled={disabled}
                  title={TURNTABLE_FORMATS[format].hint}
                >
                  {label}
                </Chip>
              );
            })}
          </div>
          <ChipField
            label="Length"
            options={TURNTABLE_SECONDS.map((seconds) => ({ value: seconds, label: `${seconds} s`, locked: seconds > longest }))}
            value={turntable.seconds}
            onChange={(seconds) => set({ seconds })}
            disabled={disabled}
          />
          <VideoFpsField options={TURNTABLE_FPS} value={turntable.fps} onChange={(fps) => set({ fps })} disabled={disabled} isServerExport />
        </div>
      ) : null}
    </ToggleRow>
  );
}

/** The plan's price for one design, and for the batch: the API's quote, job by job. */
export function RenderPlanPrice({ choice, designCount }: { choice: RenderPlanChoice; designCount: number }) {
  if (choice.body === null) {
    return <p className="text-xs text-muted-foreground">Renders nothing: each design is only converted.</p>;
  }
  if (choice.error) return <RenderJobError error={choice.error} />;
  if (!choice.quote) return <p className="text-xs text-muted-foreground">Pricing…</p>;
  const { render_credits: perDesign, jobs } = choice.quote;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">{creditsLabel(perDesign)}</span> a design
        {designCount > 0 ? ` · ${creditsLabel(perDesign * designCount)} for ${designCount} design${designCount === 1 ? "" : "s"}` : null}
      </p>
      <p>{jobs.map((job) => `${jobKindLabel(job.kind)} ${job.credits}`).join(" · ")}</p>
    </div>
  );
}

/**
 * What each design is rendered as once converted (ADR 0006, "Render plans"): its stills by angle
 * and size, a turntable, a spin, and whether its outputs are published, with the price the API
 * gives it. The pickers are the Campaign Pack's; the plan's caps lock what it doesn't render.
 */
export function RenderPlanPicker({ choice, designCount, disabled }: { choice: RenderPlanChoice; designCount: number; disabled?: boolean }) {
  const { plan, setPlan } = choice;
  return (
    <div className="space-y-3">
      <p className={panelLabel}>Renders</p>
      <StillOptions plan={plan} onChange={setPlan} disabled={disabled} />
      <TurntableOptions plan={plan} onChange={setPlan} disabled={disabled} />
      <ToggleRow
        id="render-plan-spin"
        label={`360° spin · ${DEFAULT_SPIN.frames} frames`}
        hint={`${DEFAULT_SPIN.size}×${DEFAULT_SPIN.size} JPG frames and spin.html in one ZIP.`}
        checked={plan.spin !== null}
        onCheckedChange={(on) => setPlan({ ...plan, spin: on ? DEFAULT_SPIN : null })}
        disabled={disabled}
      />
      <ToggleRow
        id="render-plan-publish"
        label="Publish the media"
        hint="Copies every still and video beside the piece's public embed, for product pages. Off, they stay private and download from the batch's page."
        checked={plan.publish_media}
        onCheckedChange={(publish_media) => setPlan({ ...plan, publish_media })}
        disabled={disabled}
      />
      <RenderPlanPrice choice={choice} designCount={designCount} />
    </div>
  );
}
