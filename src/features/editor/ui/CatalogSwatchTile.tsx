"use client";

import { Check } from "lucide-react";
import { catalogFallbackColor, catalogSwatchImageUrl } from "@/lib/catalog/swatch";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

type CatalogSwatchTileProps = {
  item: CatalogItem;
  selected?: boolean;
  gemShape?: boolean;
  onClick?: () => void;
};

export function CatalogSwatchTile({ item, selected, gemShape = false, onClick }: CatalogSwatchTileProps) {
  const swatchUrl = catalogSwatchImageUrl(item);
  const fallbackColor = catalogFallbackColor(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2 text-center transition-colors",
        "border-border/60 bg-card/50 hover:border-foreground/30 hover:bg-card",
        selected && "border-foreground/45 bg-card shadow-sm",
      )}
      aria-pressed={selected}
      title={item.label}
    >
      <span
        className={cn(
          "relative grid size-10 place-items-center overflow-hidden",
          gemShape ? "rotate-45 rounded-md" : "rounded-full",
          selected && "ring-2 ring-foreground/40 ring-offset-2 ring-offset-card",
        )}
        style={{ backgroundColor: swatchUrl ? undefined : fallbackColor }}
      >
        {swatchUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={swatchUrl}
            alt=""
            loading="lazy"
            className={cn("size-full object-cover", gemShape && "-rotate-45 scale-[1.35]")}
          />
        ) : null}
        {selected ? (
          <Check
            className={cn(
              "absolute size-3.5 drop-shadow",
              gemShape && "-rotate-45",
              "text-foreground",
            )}
            strokeWidth={3}
            aria-hidden
          />
        ) : null}
      </span>
      <span
        className={cn(
          "line-clamp-2 max-w-full text-[10px] font-medium leading-tight text-foreground/75",
          selected && "text-foreground",
        )}
      >
        {item.label}
      </span>
    </button>
  );
}
