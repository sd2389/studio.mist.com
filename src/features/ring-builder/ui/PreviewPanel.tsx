"use client";

import dynamic from "next/dynamic";
import { Pause, RotateCw } from "lucide-react";
import type { JewelrySpecs, PieceKind, BuiltPart } from "@/lib/jewelry-cad";
import { PREVIEW_VIEWS, type PreviewView } from "@/features/ring-builder/domain/preview-views";
import styles from "@/features/ring-builder/ui/designer.module.css";
import { cn } from "@/lib/utils";

const DesignCanvas = dynamic(() => import("@/features/ring-builder/ui/DesignCanvas"), {
  ssr: false,
  loading: () => <div className={cn("absolute inset-0", styles.shimmer)} />,
});

type Props = {
  title: string;
  summary: string;
  parts: BuiltPart[] | null;
  specs: JewelrySpecs | null;
  kind: PieceKind;
  hasCenterStone: boolean;
  building: boolean;
  error: string | null;
  view: PreviewView;
  viewNonce: number;
  onView: (view: PreviewView) => void;
  autoRotate: boolean;
  onAutoRotate: (value: boolean) => void;
  className?: string;
};

function Readout({ specs }: { specs: JewelrySpecs }) {
  const items = [
    { label: "Metal", value: `${specs.metalGrams.toFixed(2)} g` },
    { label: "Stones", value: specs.stoneCount ? `${specs.totalCarat.toFixed(2)} ctw` : "—" },
    { label: "Size", value: `${specs.sizeMm.x.toFixed(1)} × ${specs.sizeMm.z.toFixed(1)} mm` },
  ];
  return (
    <dl className="flex gap-4 sm:gap-6">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-[8.5px] uppercase tracking-[0.16em] text-foreground/40">{i.label}</dt>
          <dd className="text-[13px] tabular-nums tracking-[-0.01em] text-foreground">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PreviewPanel(props: Props) {
  const { title, summary, parts, specs, kind, hasCenterStone, building, error, view, viewNonce, onView, autoRotate, onAutoRotate, className } = props;
  return (
    <div className={cn("relative flex flex-col overflow-hidden rounded-[2rem] border border-foreground/[0.06] shadow-[0_22px_70px_rgba(91,112,137,0.12)]", styles.stage, className)}>
      {/* Phones: the title sits above the stage so it never covers the head; sm+: overlay. */}
      <div className="pointer-events-none relative z-10 flex shrink-0 items-start justify-between gap-3 p-4 pb-0 sm:absolute sm:inset-x-0 sm:top-0 sm:p-6">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">Live CAD · mm</p>
          <h1 className="mt-1 text-[clamp(1.6rem,3.6vw,2.6rem)] font-light leading-none tracking-[-0.05em] text-foreground">{title}</h1>
          <p className="mt-1.5 truncate text-[12px] text-foreground/55">{summary}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <span
            className={cn(
              "rounded-full bg-surface/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-holo backdrop-blur transition-opacity",
              building ? "opacity-100" : "opacity-0",
            )}
            aria-live="polite"
          >
            {building ? "Building" : ""}
          </span>
          <button
            type="button"
            onClick={() => onAutoRotate(!autoRotate)}
            aria-pressed={autoRotate}
            aria-label={autoRotate ? "Stop turntable" : "Start turntable"}
            className="grid size-10 place-items-center rounded-full border border-foreground/[0.08] bg-surface/70 text-foreground/70 backdrop-blur transition hover:bg-surface hover:text-foreground"
          >
            {autoRotate ? <Pause className="size-4" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {parts ? (
          <DesignCanvas parts={parts} kind={kind} hasCenterStone={hasCenterStone} view={view} viewNonce={viewNonce} autoRotate={autoRotate} />
        ) : (
          <div className={cn("absolute inset-0", styles.shimmer)} />
        )}
      </div>

      {error ? (
        <p role="alert" className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-2xl bg-surface/85 p-4 text-center text-sm text-destructive backdrop-blur">
          This combination could not be built: {error}
        </p>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="hidden rounded-2xl bg-surface/60 px-4 py-2.5 backdrop-blur sm:block">{specs ? <Readout specs={specs} /> : null}</div>
        <div role="radiogroup" aria-label="Camera view" className="flex gap-1 self-center rounded-full bg-surface/70 p-1 backdrop-blur sm:self-auto">
          {PREVIEW_VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={view === v.value}
              onClick={() => onView(v.value)}
              className={cn(
                "min-h-9 rounded-full px-3 text-[11px] tracking-[-0.01em] transition",
                view === v.value ? "bg-foreground text-background" : "text-foreground/60 hover:bg-surface hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
