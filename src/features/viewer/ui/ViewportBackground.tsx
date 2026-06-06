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

  return <div aria-hidden className={cn("absolute inset-0 -z-10", className)} style={style} />;
}
