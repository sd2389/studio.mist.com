"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type EditorStepperFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
};

export function EditorStepperField({
  label,
  value,
  onChange,
  step = 0.01,
  min,
  max,
  suffix,
  className,
}: EditorStepperFieldProps) {
  const clamp = (next: number) => {
    let clamped = next;
    if (typeof min === "number") clamped = Math.max(min, clamped);
    if (typeof max === "number") clamped = Math.min(max, clamped);
    return clamped;
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onChange(clamp(Number((value - step).toFixed(4))))}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-3" aria-hidden />
        </Button>
        <Input
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(clamp(parsed));
          }}
          className="h-8 text-center text-xs tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onChange(clamp(Number((value + step).toFixed(4))))}
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-3" aria-hidden />
        </Button>
        {suffix ? <span className="text-[10px] text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );
}
