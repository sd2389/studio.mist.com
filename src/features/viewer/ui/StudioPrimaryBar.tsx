"use client";

import { cn } from "@/lib/utils";

export type StudioPrimaryPanel = "metal" | "gem" | "light" | "export" | "more" | null;

const CONTROLS: { id: Exclude<StudioPrimaryPanel, null>; label: string }[] = [
  { id: "metal", label: "Metal" },
  { id: "gem", label: "Gem" },
  { id: "light", label: "Light" },
  { id: "export", label: "Export" },
  { id: "more", label: "More" },
];

type StudioPrimaryBarProps = {
  active: StudioPrimaryPanel;
  onChange: (panel: StudioPrimaryPanel) => void;
  className?: string;
};

export function StudioPrimaryBar({ active, onChange, className }: StudioPrimaryBarProps) {
  return (
    <div
      className={cn(
        "mx-5 flex h-auto shrink-0 justify-start gap-1 self-start border-b border-border/60 bg-transparent p-0",
        className,
      )}
      role="tablist"
      aria-label="Studio primary controls"
    >
      {CONTROLS.map((control) => {
        const isActive = active === control.id;
        return (
          <button
            key={control.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(isActive ? null : control.id)}
            className={cn(
              "rounded-none border-b-2 px-1.5 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground/80",
            )}
          >
            {control.label}
          </button>
        );
      })}
    </div>
  );
}
