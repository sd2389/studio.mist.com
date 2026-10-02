"use client";

import { cn } from "@/lib/utils";

type JpegQualityFieldProps = {
  /** 0–1, as the encoders take it. */
  value: number;
  onChange: (quality: number) => void;
  min?: number;
  disabled?: boolean;
  className?: string;
};

/** JPEG quality slider shown in percent (encoders default to 95). */
export function JpegQualityField({ value, onChange, min = 70, disabled, className }: JpegQualityFieldProps) {
  const percent = Math.round(value * 100);
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs",
        className,
      )}
    >
      <span>JPEG quality</span>
      <span className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={100}
          value={percent}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value) / 100)}
          className="w-24 accent-foreground"
          aria-label="JPEG quality"
        />
        <span className="w-7 text-right tabular-nums">{percent}</span>
      </span>
    </label>
  );
}
