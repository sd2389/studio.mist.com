"use client";

import { cn } from "@/lib/utils";
import type { FinishId } from "@/stores/material-preset-store";

/**
 * Inline SVG that visually previews what each finish looks like at chip scale.
 * Tinted with the current material colour so the chip reads as that finish on
 * that metal. ~28×28 px, intended for sidebar list rows.
 */
export function FinishPreview({
  finish,
  color,
  className,
}: {
  finish: FinishId;
  color: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7 shrink-0", className)}
      aria-hidden
    >
      <defs>
        <radialGradient id={`fp-${finish}-shine`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id={`fp-${finish}-shade`} cx="65%" cy="80%" r="60%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
          <stop offset="60%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {finish === "brushed" ? (
          <pattern id="fp-brush" width="2" height="32" patternUnits="userSpaceOnUse">
            <line x1="1" y1="0" x2="1" y2="32" stroke="rgba(0,0,0,0.22)" strokeWidth="0.6" />
          </pattern>
        ) : null}
        {finish === "sandblasted" ? (
          <pattern id="fp-blast" width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.6" fill="rgba(0,0,0,0.3)" />
          </pattern>
        ) : null}
      </defs>

      <circle cx="16" cy="16" r="14" fill={color} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />

      {finish === "brushed" ? (
        <circle cx="16" cy="16" r="14" fill="url(#fp-brush)" />
      ) : null}
      {finish === "sandblasted" ? (
        <circle cx="16" cy="16" r="14" fill="url(#fp-blast)" />
      ) : null}
      {finish === "satin" ? (
        <circle cx="16" cy="16" r="14" fill="rgba(255,255,255,0.06)" />
      ) : null}
      {finish === "hammered" ? (
        <g opacity="0.55">
          <circle cx="11" cy="10" r="3" fill="rgba(255,255,255,0.5)" />
          <circle cx="21" cy="13" r="3.5" fill="rgba(0,0,0,0.18)" />
          <circle cx="13" cy="22" r="3" fill="rgba(0,0,0,0.2)" />
          <circle cx="22" cy="22" r="2.5" fill="rgba(255,255,255,0.4)" />
        </g>
      ) : null}

      <circle cx="16" cy="16" r="14" fill={`url(#fp-${finish}-shine)`} />
      {finish === "polished" || finish === "satin" ? (
        <circle cx="16" cy="16" r="14" fill={`url(#fp-${finish}-shade)`} />
      ) : null}
    </svg>
  );
}
