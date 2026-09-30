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
  /** Paper-stage disc grid for Studio catalogs. Default keeps the card chip. */
  variant?: "card" | "paper";
};

/**
 * Colour swatch with label. `paper` is the Studio catalog disc; `card` is the
 * bordered chip used by denser grids that still want a contained tile.
 */
export function MaterialSwatch({
  id,
  label,
  selected,
  onClick,
  className,
  variant = "card",
}: MaterialSwatchProps) {
  const color = getPresetSwatchColor(id);
  const isGem = isTransmissive(id);
  const isDark = id === "diamond-black" || id === "titanium";

  if (variant === "paper") {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        className={cn(
          "group relative flex flex-col items-center gap-1.5 px-0.5 py-1 text-center",
          className,
        )}
        aria-pressed={selected}
        title={label}
      >
        <span
          className={cn(
            "relative grid size-10 place-items-center rounded-full transition-shadow",
            "shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-3px_6px_rgba(0,0,0,0.15)]",
          )}
          style={{
            backgroundColor: color,
            boxShadow: selected
              ? `0 0 0 2px #F4F2EE, 0 0 0 3.5px ${color}, inset 0 2px 4px rgba(255,255,255,0.45), inset 0 -3px 6px rgba(0,0,0,0.15)`
              : undefined,
          }}
        >
          {selected ? (
            <Check
              className={cn(
                "size-3.5 drop-shadow",
                isDark ? "text-white" : "text-black/85",
              )}
              strokeWidth={3}
              aria-hidden
            />
          ) : null}
        </span>
        <span
          className={cn(
            "line-clamp-2 max-w-[4.5rem] text-[9.5px] font-medium leading-tight tracking-tight text-black/55",
            selected && "text-black",
          )}
        >
          {label}
        </span>
      </motion.button>
    );
  }

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
