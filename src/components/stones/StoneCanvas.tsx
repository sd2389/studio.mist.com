"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { StudioCanvas } from "@/features/viewer";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { isGemTraceMaterial, prepareGemTraceMesh } from "@/lib/gem-gpu/gem-trace-material";
import { createPresetMaterial } from "@/lib/material-presets";
import type { CutInfo } from "@/lib/stones/cut-geometries";
import { useCutGeometry } from "@/lib/stones/load-cut-geometry";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { FACE_UP_CAMERA, FaceUpStone } from "./FaceUpStone";

type StoneCanvasProps = {
  cut: CutInfo;
  preset: Exclude<MaterialPresetId, "original">;
  autoRotate: boolean;
  lighting: LightingPresetId;
};

export function StoneCanvas({ cut, preset, autoRotate, lighting }: StoneCanvasProps) {
  const geometry = useCutGeometry(cut.id);
  const material = useMemo(() => createPresetMaterial(preset), [preset]);
  useEffect(() => () => material.dispose(), [material]);
  const mesh = useMemo(() => {
    if (!geometry) return null;
    const stone = new THREE.Mesh(geometry, material);
    if (isGemTraceMaterial(material)) prepareGemTraceMesh(stone);
    return stone;
  }, [geometry, material]);

  return (
    <StudioCanvas
      lighting={lighting}
      autoRotate={false}
      camera={{ ...FACE_UP_CAMERA, position: [0, 4.3, 0.9], fov: 40 }}
      gemBackdrop={isGemPresetId(preset)}
    >
      {mesh ? (
        <FaceUpStone rocking={autoRotate}>
          <primitive object={mesh} />
        </FaceUpStone>
      ) : null}
    </StudioCanvas>
  );
}
