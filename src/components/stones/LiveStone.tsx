"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFilmTheme } from "@/components/scroll-film/film-theme";
import { StudioCanvas } from "@/features/viewer";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { registerGemTraceGeometry } from "@/lib/gem-gpu/gem-trace-atlas";
import type { GemPresetId } from "@/lib/gem-gpu/gem-configs";
import type { CutId } from "@/lib/stones/cut-geometries";
import { useCutGeometry } from "@/lib/stones/load-cut-geometry";
import { useNearViewport } from "@/lib/use-near-viewport";
import { LIGHTING_PRESETS, siteLighting } from "@/lib/viewer-lighting";
import { FACE_UP_CAMERA, FaceUpStone } from "./FaceUpStone";

type LiveStoneProps = {
  cutId: CutId;
  gem?: GemPresetId;
  className?: string;
  camera?: { position: [number, number, number]; fov: number };
  children?: React.ReactNode;
};

/**
 * A ray-traced stone turning on the site's stage (dark set on the dark theme, white
 * studio on paper). It only renders while near the viewport.
 */
export function LiveStone({ cutId, gem = "diamond", className, camera = FACE_UP_CAMERA, children }: LiveStoneProps) {
  const geometry = useCutGeometry(cutId);
  const material = useMemo(() => createGemMaterial(gem), [gem]);
  useEffect(() => () => material.dispose(), [material]);
  const frameRef = useRef<HTMLDivElement>(null);
  const live = useNearViewport(frameRef);
  const lighting = siteLighting(useFilmTheme());
  // Cut geometry is flat-shaded and shared by every view of the cut; registering is idempotent.
  if (geometry) registerGemTraceGeometry(geometry);

  return (
    <div ref={frameRef} className={`relative overflow-hidden ${className ?? ""}`} style={{ backgroundColor: LIGHTING_PRESETS[lighting].gemBackground }}>
      {children}
      {live && geometry ? (
        <StudioCanvas tile lighting={lighting} autoRotate={false} camera={camera}>
          <FaceUpStone>
            {/* Geometry is shared; only the material is this view's. */}
            <mesh geometry={geometry} material={material} dispose={null} />
          </FaceUpStone>
        </StudioCanvas>
      ) : null}
    </div>
  );
}
