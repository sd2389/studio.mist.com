"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type EditorSliderFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
};

export function EditorSliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  className,
}: EditorSliderFieldProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
        <span className="text-[11px] tabular-nums text-foreground">
          {value}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onChange(clamp(value - step))}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-3" aria-hidden />
        </Button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          className="h-1.5 w-full cursor-pointer accent-foreground"
          aria-label={label}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onChange(clamp(value + step))}
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-3" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
