import { formatStorageGb } from "@/lib/billing/format";
import type { PricingPlan } from "@/lib/billing/types";
import { formatPolyCount } from "@/lib/upload/polygon-limits";

/**
 * How plans are described to visitors. Every number comes from the live catalog
 * (backend/app/features/billing/plans.py); only the wording lives here.
 */

/** Studio export presets top out at 8K (7680 px); the plan caps are 4096 and 8192 px. */
export function formatResolutionLabel(px: number): string {
  if (px >= 7680) return "8K";
  if (px >= 3840) return "4K";
  return `${px}px`;
}

const NUMBER = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return NUMBER.format(value);
}

/** One line on who each tier is for. */
export const PLAN_POSITIONING: Record<string, string> = {
  free: "Try the full studio on your own pieces.",
  grow: "For a jeweler shooting a growing catalogue.",
  studio: "For brands and studios working at volume.",
};

export function planPositioning(plan: PricingPlan): string {
  return PLAN_POSITIONING[plan.tier] ?? "";
}

/**
 * Allowances refill on each paid invoice (stripe_service `invoice.paid`); Free has no billing
 * period, so its allowance is one-time and must not be described as monthly.
 */
export function refillsMonthly(plan: PricingPlan): boolean {
  return plan.tier !== "free";
}

function perPeriod(plan: PricingPlan): string {
  return refillsMonthly(plan) ? " a month" : "";
}

/** The two facts that separate the tiers at a glance. */
export function planHighlights(plan: PricingPlan): string[] {
  return [
    `${formatCount(plan.quotas.model_credits)} model uploads${perPeriod(plan)}`,
    `Stills up to ${formatResolutionLabel(plan.features.max_image_resolution)}`,
  ];
}

/** What a plan card lists, strongest differentiators first. */
export function planCardFeatures(plan: PricingPlan): string[] {
  const lines = [
    `${formatCount(plan.quotas.model_credits)} model uploads${perPeriod(plan)}`,
    `${formatCount(plan.quotas.render_credits)} render credits${perPeriod(plan)}`,
    `${formatCount(plan.quotas.ai_image_credits)} AI image credits${perPeriod(plan)}`,
    `Stills up to ${formatResolutionLabel(plan.features.max_image_resolution)}`,
    plan.features.batch_export_enabled ? "Batch export" : null,
    plan.features.embed_enabled ? "Shoppable 3D embed" : null,
    `${formatStorageGb(plan.quotas.storage_bytes_limit)} storage`,
  ];
  return lines.filter((line): line is string => line !== null);
}

/** "$49/mo" → { amount: "$49", suffix: "/mo" }, so the figure can be set larger than its unit. */
export function splitPriceLabel(label: string): { amount: string; suffix: string } {
  const match = /^([^\d]*[\d.,]+)(.*)$/.exec(label.trim());
  return match ? { amount: match[1], suffix: match[2].trim() } : { amount: label, suffix: "" };
}

export type PlanCell = string | boolean;

export type PlanRow = {
  label: string;
  hint?: string;
  value: (plan: PricingPlan) => PlanCell;
};

export type PlanRowGroup = { title: string; rows: PlanRow[] };

/**
 * Comparison table. Omitted on purpose: the watermark and 8K-video flags, which the exporters
 * do not enforce yet, so listing them would promise a difference customers would not see.
 */
export const PLAN_COMPARISON: readonly PlanRowGroup[] = [
  {
    title: "Credits",
    rows: [
      { label: "Model uploads", hint: "One credit per model you upload and save.", value: (p) => formatCount(p.quotas.model_credits) },
      { label: "Render credits", hint: "Renders processed on Mist's servers, one credit each.", value: (p) => formatCount(p.quotas.render_credits) },
      { label: "AI image credits", hint: "AI backgrounds and on-model shots (beta).", value: (p) => formatCount(p.quotas.ai_image_credits) },
      { label: "Custom materials", hint: "Your own metal and gem recipes, saved to your library.", value: (p) => formatCount(p.quotas.custom_material_credits) },
      { label: "Custom assets", hint: "Uploaded backgrounds and HDR environments.", value: (p) => formatCount(p.quotas.custom_asset_credits) },
    ],
  },
  {
    title: "Exports",
    rows: [
      { label: "Still resolution", value: (p) => `Up to ${formatResolutionLabel(p.features.max_image_resolution)}` },
      { label: "Batch export", hint: "Render several looks or angles in one go.", value: (p) => p.features.batch_export_enabled },
      { label: "Shoppable embed", value: (p) => p.features.embed_enabled },
    ],
  },
  {
    title: "Models",
    rows: [
      { label: "Polygons per model", value: (p) => `Up to ${formatPolyCount(p.features.max_polygons)}` },
      { label: "Variants per model", hint: "Saved metal and stone combinations.", value: (p) => `Up to ${formatCount(p.features.max_variants_per_model)}` },
      { label: "Storage", value: (p) => formatStorageGb(p.quotas.storage_bytes_limit) },
    ],
  },
];
