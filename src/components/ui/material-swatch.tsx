"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getPresetSwatchColor, isTransmissive } from "@/lib/material-swatch";
import type { MaterialPresetId } from "@/stores/material-preset-store";

type MaterialSwatchProps = {
  id: MaterialPresetId;
  label: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
};

/**
 * Two-row chip: the colour disc is the primary visual anchor; label sits beneath in
 * compact sans. Selected state lights a 2px ring in the swatch's own hex so the
 * chip glows in its own colour — the gallery-card move.
 */
export function MaterialSwatch({ id, label, selected, onClick, className }: MaterialSwatchProps) {
  const color = getPresetSwatchColor(id);
  const isGem = isTransmissive(id);
  const isDark = id === "diamond-black" || id === "titanium";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className={cn(
        "group relative flex flex-col items-center gap-1.5 rounded-2xl border bg-card/60 px-2 py-2.5 text-center transition-colors",
        "border-border/60 backdrop-blur-sm",
        "hover:border-foreground/25 hover:bg-card",
        selected && "border-foreground/45 bg-card shadow-sm",
        className,
      )}
      aria-pressed={selected}
      title={label}
    >
      <span
        className={cn(
          "relative grid size-9 place-items-center transition-transform",
          isGem ? "rounded-md rotate-45" : "rounded-full",
          isGem && "shadow-[inset_0_2px_4px_rgba(255,255,255,0.55),inset_0_-2px_6px_rgba(0,0,0,0.18)]",
          !isGem && "shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-3px_6px_rgba(0,0,0,0.15)]",
        )}
        style={{
          backgroundColor: color,
          boxShadow: selected
            ? `0 0 0 2px var(--background), 0 0 0 4px ${color}, 0 6px 14px -6px ${color}80`
            : undefined,
        }}
      >
        {selected ? (
          <Check
            className={cn(
              "size-3.5 drop-shadow",
              isGem ? "-rotate-45" : "",
              isDark ? "text-white" : "text-black/85",
            )}
            strokeWidth={3}
            aria-hidden
          />
        ) : null}
      </span>
      <span
        className={cn(
          "line-clamp-1 max-w-[5.5rem] text-[10.5px] font-medium leading-tight tracking-tight text-foreground/80 transition-colors",
          selected && "text-foreground",
        )}
      >
        {label}
      </span>
    </motion.button>
  );
}
