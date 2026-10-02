"use client";

import { ArrowUpRight, Box, Download, FileArchive, Loader2, Shapes } from "lucide-react";
import type { ReactNode } from "react";
import type { DesignAction } from "@/features/ring-builder/ui/useDesignActions";
import { cn } from "@/lib/utils";

type Props = {
  ready: boolean;
  isRing: boolean;
  busy: DesignAction | null;
  progress: string | null;
  error: string | null;
  includeStones: boolean;
  onIncludeStones: (value: boolean) => void;
  onDownload: (action: DesignAction) => void;
  onOpenInStudio: () => void;
  className?: string;
};

function FileButton({ icon, label, detail, action, busy, disabled, onClick }: { icon: ReactNode; label: string; detail: string; action: DesignAction; busy: DesignAction | null; disabled: boolean; onClick: (a: DesignAction) => void }) {
  const active = busy === action;
  return (
    <button
      type="button"
      disabled={disabled || busy !== null}
      onClick={() => onClick(action)}
      className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-foreground/[0.07] bg-muted px-3.5 py-3 text-left transition hover:border-foreground/20 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-foreground/70 ring-1 ring-foreground/[0.06] group-hover:text-foreground">
        {active ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] tracking-[-0.01em] text-foreground">{label}</span>
        <span className="block truncate text-[11px] text-foreground/45">{detail}</span>
      </span>
    </button>
  );
}

export function DownloadsCard(props: Props) {
  const { ready, isRing, busy, progress, error, includeStones, onIncludeStones, onDownload, onOpenInStudio, className } = props;
  const disabled = !ready;
  return (
    <section className={cn("rounded-[1.6rem] border border-foreground/[0.06] bg-surface/75 p-4 backdrop-blur sm:p-5", className)}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] tracking-[-0.02em] text-foreground">Files</h2>
        <span className="text-[11px] text-foreground/45">Watertight · millimetres</span>
      </header>
      <div className="grid grid-cols-2 gap-2">
        <FileButton icon={<Download className="size-4" aria-hidden />} label="STL" detail={includeStones ? "Metal + stones" : "Metal, ready to cast"} action="stl" busy={busy} disabled={disabled} onClick={onDownload} />
        <FileButton icon={<Shapes className="size-4" aria-hidden />} label="OBJ" detail="Slot-named objects" action="obj" busy={busy} disabled={disabled} onClick={onDownload} />
        <FileButton icon={<Box className="size-4" aria-hidden />} label="GLB" detail="Materials + slots" action="glb" busy={busy} disabled={disabled} onClick={onDownload} />
        <FileButton
          icon={<FileArchive className="size-4" aria-hidden />}
          label="All sizes"
          detail={busy === "sizes" && progress ? `Building ${progress}` : isRing ? "US 3–13 · ½ sizes · ZIP" : "Rings only"}
          action="sizes"
          busy={busy}
          disabled={disabled || !isRing}
          onClick={onDownload}
        />
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[12px] text-foreground/60">
        <input type="checkbox" checked={includeStones} onChange={(e) => onIncludeStones(e.target.checked)} className="size-4 accent-[#212121]" />
        Include stones in STL / OBJ
      </label>
      <button
        type="button"
        disabled={disabled || busy !== null}
        onClick={onOpenInStudio}
        className="mt-4 flex min-h-[52px] w-full items-center justify-between gap-4 rounded-full bg-foreground px-6 text-[11px] font-semibold uppercase tracking-[0.1em] text-background shadow-[0_14px_30px_-16px_rgba(0,0,0,0.75)] transition hover:-translate-y-0.5 hover:bg-holo disabled:translate-y-0 disabled:opacity-50"
      >
        {busy === "studio" ? "Preparing your model…" : "Open in Studio"}
        {busy === "studio" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
      </button>
      <p className="mt-2 text-center text-[11px] text-foreground/45">Render it, light it, and publish it in the MIST studio.</p>
      {error ? (
        <p role="alert" className="mt-2 text-center text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
