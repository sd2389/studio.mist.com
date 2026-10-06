import { fetchBillingAccount } from "@/lib/billing/client";
import type { UserBillingSnapshot } from "@/lib/billing/types";
import { fitsExportLimits, type ExportLimits } from "@/lib/export-limits";
import { IMAGE_RESOLUTIONS } from "@/lib/export-presets";

/**
 * What a video rendered on the server may be (ADR 0005, "Plans"), from the billing snapshot;
 * the API refuses the rest (backend/app/features/render_jobs/plan_limits.py). The browser's
 * recorder knows only the size cap.
 */
export type VideoLimits = {
  maxFps: number;
  maxSeconds: number;
  /** An 8K video's length; 0 where the plan has no 8K video. */
  max8kSeconds: number;
};

/**
 * What the signed-in plan allows exports, from the billing snapshot: the size cap
 * (`max_image_resolution`), the watermark (`watermark_exports`), Campaign Packs (by tier) and
 * a server video's frame rate and length.
 */
export type ExportPlan = ExportLimits & {
  /** "Free", "Grow", "Studio". */
  label: string;
  campaignPack: boolean;
  video: VideoLimits;
};

/** Free's limits, which also apply when no plan can be read (signed out, offline). */
export const FREE_EXPORT_PLAN: ExportPlan = {
  label: "Free",
  maxEdge: 4096,
  watermark: true,
  campaignPack: false,
  video: { maxFps: 30, maxSeconds: 20, max8kSeconds: 0 },
};

/**
 * The fastest frame rate a server video renders at, on every plan (MAX_VIDEO_FPS in
 * backend/app/features/render_jobs/specs.py): the Videos tab's 90 and 120 fps are dropped.
 */
export const JOB_VIDEO_MAX_FPS = 60;

/**
 * The rate a video renders at on the server: one picked for the browser's recorder before the
 * flag loaded (90 or 120 fps) comes down to the server's fastest, which the API accepts.
 */
export function jobVideoFps<Fps extends number>(fps: Fps): Fps {
  return (fps > JOB_VIDEO_MAX_FPS ? JOB_VIDEO_MAX_FPS : fps) as Fps;
}
/** The longest video the studio asks for: the Videos tab's duration goes up to a minute. */
const LONGEST_VIDEO_SECONDS = 60;
/** A frame of more megapixels than 4K's is 8K video (VIDEO_4K_MEGAPIXELS in backend/app/features/billing/plans.py). */
const VIDEO_4K_MEGAPIXELS = 8.3;

const CAMPAIGN_PACK_TIERS: readonly string[] = ["grow", "studio"];

/** The longest preset edge (8K); a plan capped below it can't export every preset. */
const LARGEST_PRESET_EDGE = IMAGE_RESOLUTIONS["8k"].width;

export function exportPlanFromSnapshot(snapshot: UserBillingSnapshot): ExportPlan {
  const { features } = snapshot;
  return {
    label: snapshot.plan_label,
    maxEdge: features.max_image_resolution,
    watermark: features.watermark_exports,
    campaignPack: CAMPAIGN_PACK_TIERS.includes(snapshot.plan_tier),
    video: {
      maxFps: features.max_video_fps,
      maxSeconds: features.max_video_seconds,
      max8kSeconds: features.max_8k_video_seconds,
    },
  };
}

let pending: Promise<ExportPlan> | null = null;

/**
 * The plan's export limits, read afresh for every export, since signing out or in changes
 * them; callers asking at the same time share one request. When the account can't be read
 * the result is Free's limits.
 */
export function loadExportPlan(): Promise<ExportPlan> {
  pending ??= fetchBillingAccount()
    .then(exportPlanFromSnapshot, () => FREE_EXPORT_PLAN)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** The pack engine's own gate, whatever the dialog showed. */
export function assertCampaignPackAllowed(plan: ExportPlan): void {
  if (!plan.campaignPack) throw new Error("Campaign packs are part of Grow and Studio — upgrade to render one.");
}

/** The longest video, in seconds, the plan renders on the server at this frame size: shorter at 8K, 0 for none. */
export function maxVideoSeconds(plan: ExportPlan, width: number, height: number): number {
  return (width * height) / 1_000_000 > VIDEO_4K_MEGAPIXELS ? plan.video.max8kSeconds : plan.video.maxSeconds;
}

/** Whether the plan renders a video of this frame size on the server: within its size cap, and 8K only with 8K video. */
export function fitsVideoSize(plan: ExportPlan, width: number, height: number): boolean {
  return fitsExportLimits(plan, width, height) && maxVideoSeconds(plan, width, height) > 0;
}

/** Whether the plan renders a video at `fps` on the server (Free: up to 30). */
export function fitsVideoFps(plan: ExportPlan, fps: number): boolean {
  return fps <= plan.video.maxFps;
}

/** The largest preset (by 16:9 width) a cap allows: 4096 → "4K". */
function presetLabelWithin(maxEdge: number): string {
  const fitting = Object.values(IMAGE_RESOLUTIONS).filter((preset) => preset.width <= maxEdge);
  return fitting.at(-1)?.label ?? `${maxEdge}px`;
}

/** "4K, 30 fps and 20 s". */
function spokenList(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");
}

/**
 * "Free plan exports up to 4K, with a MIST Studio watermark." — null when the plan limits
 * neither. A server video's note adds what its frame rate and length are held to: "Free plan
 * exports videos up to 4K, 30 fps and 20 s, with a MIST Studio watermark."
 */
export function exportPlanNote(plan: ExportPlan, { video = false }: { video?: boolean } = {}): string | null {
  const caps = [
    plan.maxEdge < LARGEST_PRESET_EDGE ? presetLabelWithin(plan.maxEdge) : null,
    video && plan.video.maxFps < JOB_VIDEO_MAX_FPS ? `${plan.video.maxFps} fps` : null,
    video && plan.video.maxSeconds < LONGEST_VIDEO_SECONDS ? `${plan.video.maxSeconds} s` : null,
  ].filter((cap): cap is string => cap !== null);
  const limits = [
    caps.length > 0 ? `up to ${spokenList(caps)}` : null,
    plan.watermark ? "with a MIST Studio watermark" : null,
  ].filter((limit): limit is string => limit !== null);
  return limits.length > 0 ? `${plan.label} plan exports ${video ? "videos " : ""}${limits.join(", ")}.` : null;
}
