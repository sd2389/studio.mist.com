"use client";

import type { ComponentProps, ReactNode } from "react";
import { LIGHTING_PRESETS } from "@/lib/viewer-lighting";
import { modelCreditFor } from "../domain/model-credit";
import { ModelCreditNote } from "./ModelCreditNote";
import { ViewerCanvas } from "./ViewerCanvas";
import { ViewportBackground } from "./ViewportBackground";

type ViewerStageProps = ComponentProps<typeof ViewerCanvas> & {
  /** Controls laid over the view, such as zoom. */
  children?: ReactNode;
};

/**
 * The lit piece on its saved backdrop. The studio and the embed both draw it with this one
 * stage, so shoppers see the piece exactly as the jeweler left it. A bundled third-party model
 * also shows the credit its licence asks for.
 */
export function ViewerStage({ children, ...canvas }: ViewerStageProps) {
  const credit = modelCreditFor(canvas.modelUrl);
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
      {credit ? <ModelCreditNote credit={credit} /> : null}
      {children}
    </div>
  );
}
