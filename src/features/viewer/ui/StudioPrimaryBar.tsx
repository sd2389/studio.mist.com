"use client";

import { CircleEllipsis, Diamond, Gem, Lightbulb, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioPrimaryPanel =
  | "metal"
  | "gem"
  | "light"
  | "export"
  | "more"
  | null;

const CONTROLS = [
  { id: "metal", label: "Metal", icon: CircleEllipsis },
  { id: "gem", label: "Gem", icon: Diamond },
  { id: "light", label: "Light", icon: Lightbulb },
  { id: "export", label: "Export", icon: Send },
  { id: "more", label: "More", icon: Gem },
] as const;

type StudioPrimaryBarProps = {
  active: StudioPrimaryPanel;
  onChange: (panel: StudioPrimaryPanel) => void;
  className?: string;
};

export function StudioPrimaryBar({
  active,
  onChange,
  className,
}: StudioPrimaryBarProps) {
  return (
    <div
      className={cn(
        "grid h-auto shrink-0 grid-cols-5 border-b border-white/20 bg-black/15",
        className,
      )}
      role="tablist"
      aria-label="Studio primary controls"
    >
      {CONTROLS.map((control) => {
        const isActive = active === control.id;
        const Icon = control.icon;
        return (
          <button
            key={control.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(isActive ? null : control.id)}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1.5 border-r border-white/15 px-1 py-3 text-[8px] font-medium uppercase tracking-[0.11em] transition-all last:border-r-0",
              isActive
                ? "bg-[#ef5b2a] text-black"
                : "border-transparent text-white/35 hover:bg-white/[0.05] hover:text-white/70",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.6} aria-hidden />
            {control.label}
          </button>
        );
      })}
    </div>
  );
}
