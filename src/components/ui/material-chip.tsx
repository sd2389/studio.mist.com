"use client";

import { cn } from "@/lib/utils";

type MaterialChipProps = {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
};

export function MaterialChip({ label, selected, onClick, className }: MaterialChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
        "border-border bg-card text-foreground/90",
        "hover:border-primary/30 hover:bg-muted/80",
        selected &&
          "border-primary/40 bg-primary/10 text-foreground ring-1 ring-primary/20",
        className,
      )}
    >
      <span className="relative z-10">{label}</span>
    </button>
  );
}
