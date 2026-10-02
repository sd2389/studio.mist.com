"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "@/features/ring-builder/ui/designer.module.css";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import type { MaterialPresetId } from "@/stores/material-preset-store";

/** Configurator primitives: quiet ice surfaces, ink for the selected state. */

export function Section({ index, title, aside, children }: { index: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[1.6rem] border border-foreground/[0.06] bg-surface/70 p-4 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur sm:p-5">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-2.5 text-[15px] font-normal tracking-[-0.02em] text-foreground">
          <span className="text-[10px] tabular-nums tracking-[0.12em] text-holo">{index}</span>
          {title}
        </h2>
        {aside ? <div className="text-[11px] text-foreground/45">{aside}</div> : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function FieldLabel({ children, value }: { children: ReactNode; value?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">{children}</span>
      {value !== undefined ? <span className="text-xs tabular-nums text-foreground/70">{value}</span> : null}
    </div>
  );
}

export type ChipOption<T extends string> = { value: T; label: string; disabled?: boolean };

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                "min-h-10 rounded-full border px-2 text-[12px] tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow] duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-holo/40",
                selected
                  ? "border-foreground bg-foreground text-background shadow-[0_6px_18px_-10px_rgba(0,0,0,0.6)]"
                  : "border-foreground/[0.08] bg-muted text-foreground/70 hover:border-foreground/20 hover:bg-surface hover:text-foreground",
                o.disabled && "cursor-not-allowed opacity-40",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type SwatchOption<T extends string> = {
  value: T;
  /** Full name, shown as the field's current value. */
  label: string;
  /** Studio preset that sets the swatch's colour, shape and fineness stamp. */
  presetId: MaterialPresetId;
  /** Caption under the swatch; defaults to `label`. */
  name?: string;
  /** Subheading the option is listed under. */
  group?: string;
};

export function SwatchPicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SwatchOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <div role="radiogroup" aria-label={label}>
      <FieldLabel value={current?.label}>{label}</FieldLabel>
      <div className="space-y-2.5">
        {groups.map((group) => (
          <div key={group ?? "all"}>
            {group ? <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/40">{group}</p> : null}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1">
              {options
                .filter((o) => o.group === group)
                .map((o) => (
                  <MaterialSwatch
                    key={o.value}
                    id={o.presetId}
                    label={o.name ?? o.label}
                    selected={o.value === value}
                    onClick={() => onChange(o.value)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SliderField({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: ReactNode;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <label htmlFor={id} className="block">
        <FieldLabel value={display}>{label}</FieldLabel>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(styles.range, "h-6 w-full cursor-pointer appearance-none bg-transparent")}
        style={{ ["--fill" as string]: `${pct}%` }}
      />
    </div>
  );
}

export function ToggleField({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-foreground/[0.06] bg-muted px-4 py-3 text-left transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span>
        <span className="block text-[13px] tracking-[-0.01em] text-foreground">{label}</span>
        {hint ? <span className="block text-[11px] text-foreground/45">{hint}</span> : null}
      </span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-foreground" : "bg-foreground/15")}>
        <span className={cn("absolute top-1 size-4 rounded-full bg-surface shadow transition-transform", checked ? "translate-x-5" : "translate-x-1")} />
      </span>
    </button>
  );
}
