"use client";

import { ChevronRight, Lock, PackageOpen } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useExportPlan } from "../../ui/useExportPlan";
import { CampaignPackDialog, type CampaignPackDialogProps } from "./CampaignPackDialog";

type CampaignPackLauncherProps = Omit<CampaignPackDialogProps, "open" | "onOpenChange"> & {
  className?: string;
};

/** Prominent entry point: one click from the studio to a full marketing pack. */
export function CampaignPackLauncher({ className, ...dialogProps }: CampaignPackLauncherProps) {
  const [open, setOpen] = useState(false);
  // Plans without packs still open the dialog, which offers the upgrade.
  const exportPlan = useExportPlan();
  const locked = exportPlan !== null && !exportPlan.campaignPack;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border border-foreground/80 bg-foreground px-3.5 py-3 text-left text-background shadow-sm transition-transform",
          "hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
          className,
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/15">
          <PackageOpen className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-semibold">Campaign pack</span>
          <span className="block text-[11px] text-background/70">
            3 golds × 4 angles · turntables · 360° spin · one ZIP
          </span>
        </span>
        {locked ? (
          <>
            <Lock className="size-4 shrink-0 opacity-70" aria-hidden />
            <span className="sr-only">(Grow and Studio)</span>
          </>
        ) : (
          <ChevronRight className="size-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" aria-hidden />
        )}
      </button>
      <CampaignPackDialog open={open} onOpenChange={setOpen} {...dialogProps} />
    </>
  );
}
