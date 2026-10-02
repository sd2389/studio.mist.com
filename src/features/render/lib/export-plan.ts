import { fetchBillingAccount } from "@/lib/billing/client";
import type { UserBillingSnapshot } from "@/lib/billing/types";
import type { ExportLimits } from "@/lib/export-limits";
import { IMAGE_RESOLUTIONS } from "@/lib/export-presets";

/**
 * What the signed-in plan allows exports, from the billing snapshot: the size cap
 * (`max_image_resolution`), the watermark (`watermark_exports`) and Campaign Packs (by tier).
 */
export type ExportPlan = ExportLimits & {
  /** "Free", "Grow", "Studio". */
  label: string;
  campaignPack: boolean;
};

/** Free's limits, which also apply when no plan can be read (signed out, offline). */
export const FREE_EXPORT_PLAN: ExportPlan = { label: "Free", maxEdge: 4096, watermark: true, campaignPack: false };

const CAMPAIGN_PACK_TIERS: readonly string[] = ["grow", "studio"];

/** The longest preset edge (8K); a plan capped below it can't export every preset. */
const LARGEST_PRESET_EDGE = IMAGE_RESOLUTIONS["8k"].width;

export function exportPlanFromSnapshot(snapshot: UserBillingSnapshot): ExportPlan {
  return {
    label: snapshot.plan_label,
    maxEdge: snapshot.features.max_image_resolution,
    watermark: snapshot.features.watermark_exports,
    campaignPack: CAMPAIGN_PACK_TIERS.includes(snapshot.plan_tier),
  };
}

const PLAN_REUSE_MS = 60_000;
let cached: { plan: Promise<ExportPlan>; at: number } | null = null;

/**
 * The plan's export limits: one request shared by every caller and reused for a minute.
 * When the account can't be read the result is Free's limits, and the next call asks again.
 */
export function loadExportPlan(): Promise<ExportPlan> {
  const now = Date.now();
  if (cached && now - cached.at < PLAN_REUSE_MS) return cached.plan;
  const plan = fetchBillingAccount().then(exportPlanFromSnapshot, () => {
    if (cached?.plan === plan) cached = null;
    return FREE_EXPORT_PLAN;
  });
  cached = { plan, at: now };
  return plan;
}

/** The pack engine's own gate, whatever the dialog showed. */
export function assertCampaignPackAllowed(plan: ExportPlan): void {
  if (!plan.campaignPack) throw new Error("Campaign packs are part of Grow and Studio — upgrade to render one.");
}

/** The largest preset (by 16:9 width) a cap allows: 4096 → "4K". */
function presetLabelWithin(maxEdge: number): string {
  const fitting = Object.values(IMAGE_RESOLUTIONS).filter((preset) => preset.width <= maxEdge);
  return fitting.at(-1)?.label ?? `${maxEdge}px`;
}

/** "Free plan exports up to 4K, with a MIST Studio watermark." — null when the plan limits neither. */
export function exportPlanNote(plan: ExportPlan): string | null {
  const limits = [
    plan.maxEdge < LARGEST_PRESET_EDGE ? `up to ${presetLabelWithin(plan.maxEdge)}` : null,
    plan.watermark ? "with a MIST Studio watermark" : null,
  ].filter((limit): limit is string => limit !== null);
  return limits.length > 0 ? `${plan.label} plan exports ${limits.join(", ")}.` : null;
}
