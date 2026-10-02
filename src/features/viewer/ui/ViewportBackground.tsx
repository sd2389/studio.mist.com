"use client";

import type { CSSProperties } from "react";
import { backgroundStyleFromSelection } from "@/lib/catalog/scene-appearance";
import type { BackgroundItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

type ViewportBackgroundProps = {
  backgroundItem: BackgroundItem | null;
  customBackground: string | null | undefined;
  fallbackColor: string;
  className?: string;
};

/**
 * A gradient or image backdrop, as CSS behind the canvas: placed before the canvas in the
 * stage, it shows wherever the canvas is transparent. A negative z-index would put it under
 * the stage's own paper, out of sight.
 */
export function ViewportBackground({
  backgroundItem,
  customBackground,
  fallbackColor,
  className,
}: ViewportBackgroundProps) {
  const style: CSSProperties = backgroundStyleFromSelection(
    backgroundItem,
    customBackground,
    fallbackColor,
  );

  return <div aria-hidden className={cn("absolute inset-0", className)} style={style} />;
}
