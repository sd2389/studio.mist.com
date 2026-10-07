"use client";

import type { ReactNode } from "react";
import { CabochonIcon, GemIcon, MetalIcon } from "@/components/ui/swatch-icons";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { metalBadge, type SwatchShape } from "@/lib/material-colors";
import { getPresetSwatchColor, swatchShape } from "@/lib/material-swatch";
import { cn } from "@/lib/utils";
import type { MaterialPresetId } from "@/stores/material-preset-store";

/** `radio` inside a `role="radiogroup"` picker; `toggle` for loose grids; `static` shows a material without picking it, such as inside another control. */
type SwatchSemantics = "radio" | "toggle" | "static";

type SwatchFrameProps = {
  label: string;
  selected: boolean;
  onClick?: () => void;
  className?: string;
  /** Fineness stamp shown on the icon (14K, PT, 925). */
  stamp?: string;
  semantics?: SwatchSemantics;
  children: ReactNode;
};

const FRAME = "flex flex-col items-center gap-1 rounded-xl border px-1 pb-1.5 pt-2 text-center";

/** The swatch tile every picker shares: icon (or thumbnail), optional stamp, name underneath. */
export function SwatchFrame({ label, selected, onClick, className, stamp, semantics = "radio", children }: SwatchFrameProps) {
  const face = (
    <>
      <span className="relative">
        {children}
        {stamp ? (
          <span className="absolute -bottom-0.5 -right-1.5 rounded-full border border-foreground/10 bg-surface px-1 text-[8px] font-semibold leading-3 text-foreground/70">
            {stamp}
          </span>
        ) : null}
      </span>
      <span className={cn("line-clamp-2 text-[10px] leading-3", selected ? "text-foreground" : "text-foreground/60")}>{label}</span>
    </>
  );
  if (semantics === "static") {
    return (
      <span title={label} className={cn(FRAME, "border-transparent", className)}>
        {face}
      </span>
    );
  }
  const a11y = semantics === "radio" ? { role: "radio" as const, "aria-checked": selected } : { "aria-pressed": selected };
  return (
    <button
      type="button"
      {...a11y}
      aria-label={stamp ? `${label}, ${stamp}` : label}
      title={label}
      onClick={onClick}
      className={cn(
        FRAME,
        "transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-holo/40",
        selected
          ? "border-foreground bg-surface shadow-[0_6px_16px_-10px_rgba(0,0,0,0.55)]"
          : "border-transparent hover:border-foreground/10 hover:bg-surface/60",
        className,
      )}
    >
      {face}
    </button>
  );
}

const ICONS: Record<SwatchShape, (props: { color: string }) => ReactNode> = {
  faceted: GemIcon,
  cabochon: CabochonIcon,
  metal: MetalIcon,
};

/** A label that already reads "18K White" needs no 18K stamp. */
export function stampFor(label: string, stamp: string | undefined): string | undefined {
  return stamp && !label.toUpperCase().includes(stamp.toUpperCase()) ? stamp : undefined;
}

type MaterialSwatchProps = {
  /** Studio preset id or catalogue/custom material reference; colour, shape and stamp derive from it. */
  id: MaterialPresetId | SlotMaterialRef;
  label: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  /** `static` to show the material inside another control, as the bulk upload's look picker does. */
  semantics?: "radio" | "static";
};

/**
 * The one material swatch, used by every picker (studio, designer, embed, catalogue, bulk
 * upload looks): a cut gem, a cabochon or a metal band in the material's colour, its fineness
 * stamp, and its name underneath. Render it inside an element with `role="radiogroup"`, unless
 * it is `static`.
 */
export function MaterialSwatch({ id, label, selected = false, onClick, className, semantics = "radio" }: MaterialSwatchProps) {
  const shape = swatchShape(id);
  const Icon = ICONS[shape];
  return (
    <SwatchFrame
      label={label}
      selected={selected}
      onClick={onClick}
      className={className}
      semantics={semantics}
      stamp={shape === "metal" ? stampFor(label, metalBadge(id)) : undefined}
    >
      <Icon color={getPresetSwatchColor(id)} />
    </SwatchFrame>
  );
}
