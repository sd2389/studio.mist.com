"use client";

import { Diamond, Ellipsis, Share, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioPrimaryPanel =
  | "metal"
  | "gem"
  | "light"
  | "export"
  | "more"
  | null;

function RingsIcon({
  className,
  strokeWidth = 1.6,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden
    >
      <circle cx="9" cy="12" r="5.25" />
      <circle cx="15" cy="12" r="5.25" />
    </svg>
  );
}

const CONTROLS = [
  { id: "metal", label: "Metal", icon: RingsIcon },
  { id: "gem", label: "Gem", icon: Diamond },
  { id: "light", label: "Light", icon: Sun },
  { id: "export", label: "Export", icon: Share },
  { id: "more", label: "More", icon: Ellipsis },
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
        "grid h-auto shrink-0 grid-cols-5 bg-[#F4F2EE]",
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
            className="flex min-w-0 items-center justify-center px-1 py-1.5"
          >
            <span
              className={cn(
                "flex w-full flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[8px] font-medium uppercase tracking-[0.11em] transition-colors",
                isActive
                  ? "bg-black text-white"
                  : "text-black/40 hover:bg-black/[0.04] hover:text-black/70",
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.6} />
              {control.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
