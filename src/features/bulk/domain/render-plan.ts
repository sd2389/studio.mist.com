import type { RenderPlan, RenderPlanAngle } from "@/lib/api/ingest";

/*
 * A batch's render plan as the bulk upload page picks it (docs/adr/0006-bulk-pipeline.md, "Render
 * plans"). The API checks and prices it; the page only shapes the choices.
 */

export const RENDER_PLAN_ANGLES: readonly RenderPlanAngle[] = ["front", "three-quarter", "side", "top"];

/** A turntable's length, in seconds; the plan's video caps lock the longer ones. */
export const TURNTABLE_SECONDS: readonly number[] = [6, 10, 15, 30];
export const TURNTABLE_FPS: readonly number[] = [24, 30, 60];

type Stills = NonNullable<RenderPlan["stills"]>;
type Turntable = NonNullable<RenderPlan["turntable"]>;
type Spin = NonNullable<RenderPlan["spin"]>;

/** The ADR's default stills: every angle, 2000 px square, JPEG. */
export const DEFAULT_STILLS: Stills = { angles: [...RENDER_PLAN_ANGLES], size: 2000, format: "jpeg" };
/** The ADR's default turntable: 6 s once round the piece, 1080 square at 30 fps. */
export const DEFAULT_TURNTABLE: Turntable = { width: 1080, height: 1080, fps: 30, seconds: 6, quality: "high" };
/** The Campaign Pack's spin: 72 frames of 1080 px. */
export const DEFAULT_SPIN: Spin = { frames: 72, size: 1080, format: "jpeg", jpeg_quality: 0.9 };

/**
 * The ADR's default plan: four 2000 px stills and a turntable each (7 render credits a design),
 * the front still becoming the scene's thumbnail; nothing public but the embed.
 */
export const DEFAULT_RENDER_PLAN: RenderPlan = {
  stills: DEFAULT_STILLS,
  turntable: DEFAULT_TURNTABLE,
  spin: null,
  publish_media: false,
  thumbnail_from: "front",
};

/** The still the scene's thumbnail comes from: the front one, else the first angle picked. */
export function thumbnailAngle(angles: readonly RenderPlanAngle[]): RenderPlanAngle | null {
  return angles.includes("front") ? "front" : (angles[0] ?? null);
}

/** The plan with these angles, in the pack's order; no angle at all renders no stills. */
export function withStillAngles(plan: RenderPlan, angles: readonly string[]): RenderPlan {
  const picked = RENDER_PLAN_ANGLES.filter((angle) => angles.includes(angle));
  const stills = picked.length > 0 ? { ...(plan.stills ?? DEFAULT_STILLS), angles: picked } : null;
  return { ...plan, stills, thumbnail_from: thumbnailAngle(picked) };
}

/** Whether the plan renders anything: the API refuses one that renders nothing. */
export function rendersSomething(plan: RenderPlan): boolean {
  return plan.stills !== null || plan.turntable !== null || plan.spin !== null;
}

/** "4 stills at 2000 px · 6 s turntable, 1080×1080 · 72-frame spin · outputs private". */
export function renderPlanSummary(plan: RenderPlan): string {
  const parts: string[] = [];
  if (plan.stills) {
    const count = plan.stills.angles.length;
    parts.push(`${count} still${count === 1 ? "" : "s"} at ${plan.stills.size} px`);
  }
  if (plan.turntable) {
    parts.push(`${plan.turntable.seconds} s turntable, ${plan.turntable.width}×${plan.turntable.height}`);
  }
  if (plan.spin) parts.push(`${plan.spin.frames}-frame spin`);
  parts.push(plan.publish_media ? "outputs public" : "outputs private");
  return parts.join(" · ");
}
