"use client";

import { Diamond, Ellipsis, Share, SlidersHorizontal, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioPrimaryPanel =
  | "metal"
  | "gem"
  | "light"
  | "export"
  | "more"
  | "edit"
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

/** Saved scenes add an Edit tab: details, specs, full catalogues, placement, batch exports. */
const EDIT_CONTROL = { id: "edit", label: "Edit", icon: SlidersHorizontal } as const;

type StudioPrimaryBarProps = {
  active: StudioPrimaryPanel;
  onChange: (panel: StudioPrimaryPanel) => void;
  /** When true, tapping the active tab collapses the catalog (phone sheet). */
  collapsible?: boolean;
  /** Show the Edit tab (saved scenes the user can edit). */
  withEdit?: boolean;
  layout?: "icons" | "tabs";
  className?: string;
};

export function StudioPrimaryBar({
  active,
  onChange,
  collapsible = false,
  withEdit = false,
  layout = "icons",
  className,
}: StudioPrimaryBarProps) {
  const controls = withEdit ? [...CONTROLS, EDIT_CONTROL] : CONTROLS;
  return (
    <div
      className={cn(
        "grid h-auto shrink-0 bg-background",
        withEdit ? "grid-cols-6" : "grid-cols-5",
        className,
      )}
      role="tablist"
      aria-label="Studio primary controls"
    >
      {controls.map((control) => {
        const isActive = active === control.id;
        const Icon = control.icon;
        return (
          <button
            key={control.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() =>
              onChange(isActive && collapsible ? null : control.id)
            }
            className="flex min-w-0 items-center justify-center px-1 py-1.5"
          >
            <span
              className={cn(
                "flex w-full flex-col items-center gap-1 rounded-md px-1 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] transition-colors",
                layout === "tabs" && "gap-0 py-2 text-[10px] tracking-[0.08em]",
                isActive
                  ? "bg-foreground text-background"
                  : "text-foreground/40 hover:bg-foreground/[0.04] hover:text-foreground/70",
              )}
            >
              {layout === "icons" ? (
                <Icon className="size-3.5" strokeWidth={1.6} />
              ) : null}
              {control.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
