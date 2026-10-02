"use client";

import type { ComponentProps, ReactNode } from "react";
import { LIGHTING_PRESETS } from "@/lib/viewer-lighting";
import { ViewerCanvas } from "./ViewerCanvas";
import { ViewportBackground } from "./ViewportBackground";

type ViewerStageProps = ComponentProps<typeof ViewerCanvas> & {
  /** Controls laid over the view, such as zoom. */
  children?: ReactNode;
};

/**
 * The lit piece on its saved backdrop. The studio and the embed both draw it with this one
 * stage, so shoppers see the piece exactly as the jeweler left it.
 */
export function ViewerStage({ children, ...canvas }: ViewerStageProps) {
  return (
    <div className="relative min-h-0 flex-1 bg-studio-canvas">
      {canvas.backgroundItem ? (
        <ViewportBackground
          backgroundItem={canvas.backgroundItem}
          customBackground={canvas.sceneSettings?.customBackground}
          fallbackColor={LIGHTING_PRESETS[canvas.lighting].background}
        />
      ) : null}
      <ViewerCanvas {...canvas} />
      {children}
    </div>
  );
}
