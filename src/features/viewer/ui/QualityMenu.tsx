"use client";

import { Gauge } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import type { QualityLevel } from "@/lib/viewer-quality";
import { useViewerQualityStore } from "@/stores/viewer-quality-store";
import { cn } from "@/lib/utils";

const LABELS: Record<QualityLevel, string> = {
  auto: "Auto",
  high: "High",
  balanced: "Balanced",
  performance: "Performance",
};

/** Preview quality only — exports always render at full quality. */
export function QualityMenu() {
  const level = useViewerQualityStore((s) => s.level);
  const effective = useViewerQualityStore((s) => s.effective);
  const setLevel = useViewerQualityStore((s) => s.setLevel);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { startTransition(() => setMounted(true)); }, []);

  // Before mount, render a stable server-safe label to avoid React 19 hydration mismatch.
  // After mount the device-detected tier is safe to show.
  const label = !mounted
    ? level === "auto" ? "Auto" : LABELS[level]
    : level === "auto" ? `Auto (${LABELS[effective.tier]})` : LABELS[level];

  return (
    <DropdownMenu>
      {/* base-ui Trigger renders a <button>; asChild is not supported — apply Button styles via className */}
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 gap-1.5 px-2 text-black/70 hover:bg-black/[0.04] hover:text-black",
        )}
        aria-label="Preview quality"
      >
        <Gauge className="size-3.5" />
        <span className="flex flex-col items-start leading-none">
          <span className="text-[8px] font-medium uppercase tracking-[0.14em] text-black/40">
            Quality
          </span>
          <span className="text-[11px] font-medium">{label}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={level}
          onValueChange={(v) => setLevel(v as QualityLevel)}
        >
          {(Object.keys(LABELS) as QualityLevel[]).map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              {LABELS[id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
