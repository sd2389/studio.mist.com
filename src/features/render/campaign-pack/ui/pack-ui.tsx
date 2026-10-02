"use client";

import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function PackSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-foreground/80">{title}</h3>
        {aside ? <span className="text-[11px] text-muted-foreground">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}


export function ToggleRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-background/60 px-3 py-2.5", disabled && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          {hint ? <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span> : null}
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      </div>
      {checked && children ? <div className="mt-2.5">{children}</div> : null}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}
