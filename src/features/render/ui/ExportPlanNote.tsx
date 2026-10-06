"use client";

import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { exportPlanNote, type ExportPlan } from "../lib/export-plan";

type ExportPlanNoteProps = {
  plan: ExportPlan | null;
  /** A video rendered on the server: its frame rate and length are held to the plan too. */
  video?: boolean;
  className?: string;
};

/** "Free plan exports up to 4K, with a MIST Studio watermark. Upgrade" — nothing on plans without limits. */
export function ExportPlanNote({ plan, video = false, className }: ExportPlanNoteProps) {
  const note = plan ? exportPlanNote(plan, { video }) : null;
  return note ? <UpgradePrompt className={className}>{note}</UpgradePrompt> : null;
}
