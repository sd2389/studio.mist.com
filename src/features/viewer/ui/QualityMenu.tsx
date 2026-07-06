"use client";

import { Gauge } from "lucide-react";
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

  const label = level === "auto" ? `Auto (${LABELS[effective.tier]})` : LABELS[level];

  return (
    <DropdownMenu>
      {/* base-ui Trigger renders a <button>; asChild is not supported — apply Button styles via className */}
      <DropdownMenuTrigger
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        aria-label="Preview quality"
      >
        <Gauge className="size-4" />
        {label}
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
