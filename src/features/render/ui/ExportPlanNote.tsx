"use client";

import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { exportPlanNote, type ExportPlan } from "../lib/export-plan";

/** "Free plan exports up to 4K, with a MIST Studio watermark. Upgrade" — nothing on plans without limits. */
export function ExportPlanNote({ plan, className }: { plan: ExportPlan | null; className?: string }) {
  const note = plan ? exportPlanNote(plan) : null;
  return note ? <UpgradePrompt className={className}>{note}</UpgradePrompt> : null;
}
