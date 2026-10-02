"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Pill toggle for option rows: export settings, pack outputs. An optional colour dot leads the label. */
export function Chip({
  selected,
  onClick,
  disabled,
  swatch,
  children,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  swatch?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        "border-border bg-card text-foreground/85 hover:border-foreground/30 hover:bg-muted/70",
        "disabled:pointer-events-none disabled:opacity-45",
        selected && "border-foreground/70 bg-foreground text-background hover:bg-foreground/90",
      )}
    >
      {swatch ? (
        <span
          aria-hidden
          className="size-3 rounded-full border border-foreground/15 shadow-inner"
          style={{ backgroundColor: swatch }}
        />
      ) : selected ? (
        <Check className="size-3" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

/** A labelled row of chips that picks one option, such as a frame count or frame rate. */
export function ChipField<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option.value}
            selected={value === option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
