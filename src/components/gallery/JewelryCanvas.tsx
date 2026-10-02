"use client";

import { useEffect, useMemo } from "react";
import { GemGpuDiamondShimmer } from "@/components/DiamondGem";
import { applyGalleryMaterials } from "@/components/gallery/gallery-materials";
import { StudioCanvas } from "@/features/viewer";
import type { JewelryInfo } from "@/lib/jewelry/assembly";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";

type JewelryCanvasProps = {
  piece: JewelryInfo;
  preset: MaterialPresetId;
  autoRotate: boolean;
  lighting: LightingPresetId;
};

export function JewelryCanvas({ piece, preset, autoRotate, lighting }: JewelryCanvasProps) {
  const root = useMemo(() => piece.build(), [piece]);
  // "original" = as designed; a metal or gem preset from the studio sidebar recolours that role.
  useEffect(() => {
    applyGalleryMaterials(root, preset);
  }, [root, preset]);

  return (
    <StudioCanvas lighting={lighting} autoRotate={autoRotate} camera={{ position: [0, 0.35, 2.2], fov: 45 }}>
      <GemGpuDiamondShimmer object={root} active />
      <primitive object={root} />
    </StudioCanvas>
  );
}
