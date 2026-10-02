"use client";

import { SwatchFrame, stampFor } from "@/components/ui/material-swatch";
import { GemIcon, MetalIcon } from "@/components/ui/swatch-icons";
import { catalogFallbackColor, catalogSwatchImageUrl } from "@/lib/catalog/swatch";
import type { CatalogItem } from "@/lib/catalog/types";
import { metalBadge } from "@/lib/material-colors";

type CatalogSwatchTileProps = {
  item: CatalogItem;
  selected?: boolean;
  /** A gem material: drawn as a cut stone instead of a metal band. */
  gemShape?: boolean;
  /** An environment, background, ground or scene: shown as its thumbnail. */
  image?: boolean;
  onClick?: () => void;
};

/** A catalogue or library item in the shared swatch style. */
export function CatalogSwatchTile({ item, selected = false, gemShape = false, image = false, onClick }: CatalogSwatchTileProps) {
  const color = catalogFallbackColor(item);
  if (image) {
    const swatchUrl = catalogSwatchImageUrl(item);
    return (
      <SwatchFrame label={item.label} selected={selected} onClick={onClick} semantics="toggle">
        <span className="block size-10 overflow-hidden rounded-lg ring-1 ring-foreground/10" style={{ backgroundColor: color }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {swatchUrl ? <img src={swatchUrl} alt="" loading="lazy" className="size-full object-cover" /> : null}
        </span>
      </SwatchFrame>
    );
  }
  const Icon = gemShape ? GemIcon : MetalIcon;
  return (
    <SwatchFrame
      label={item.label}
      selected={selected}
      onClick={onClick}
      semantics="toggle"
      stamp={gemShape ? undefined : stampFor(item.label, metalBadge(item.slug))}
    >
      <Icon color={color} />
    </SwatchFrame>
  );
}
