"use client";

import { Center, Environment, OrbitControls } from "@react-three/drei";
import { WebGPUCanvas } from "@/lib/gpu/WebGPUCanvas";
import { ViewerContactShadows } from "@/lib/gpu/ViewerContactShadows";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { GemGpuDiamondShimmer } from "@/components/DiamondGem";
import {
  HiresExportBridge,
  OrbitControlsBridge,
  RenderFidelityBridge,
  ScreenshotBridge,
  TransparentCaptureBridge,
  VideoCaptureBridge,
} from "@/features/render";
import { ViewerPostFX } from "@/features/viewer";
import { createPresetMaterial } from "@/lib/material-presets";
import { isGemPresetId, type GemPresetId } from "@/lib/gem-gpu/gem-configs";
import { GemFireOverlay } from "@/features/gem-fire/ui/GemFireOverlay";
import { useCutGeometry } from "@/lib/stones/load-cut-geometry";
import type { CutInfo } from "@/lib/stones/cut-geometries";
import {
  AMBIENT_BY_LIGHTING,
  BG_BY_LIGHTING,
  CONTACT_SHADOW_OPACITY,
  GEM_AMBIENT_BY_LIGHTING,
  GEM_BG_BY_LIGHTING,
  GEM_HDR_FILE_BY_LIGHTING,
  GEM_SPOT_BY_LIGHTING,
  HDR_FILE_BY_LIGHTING,
  SPOT_BY_LIGHTING,
  TONE_EXPOSURE_BY_LIGHTING,
} from "@/lib/viewer-lighting";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";

type StoneCanvasProps = {
  cut: CutInfo;
  preset: MaterialPresetId;
  autoRotate: boolean;
  lighting: LightingPresetId;
};

export function StoneCanvas({ cut, preset, autoRotate, lighting }: StoneCanvasProps) {
  const geometry = useCutGeometry(cut.id);
  const material = useMemo<THREE.Material>(() => {
    if (preset === "original") {
      return new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.85, roughness: 0.3 });
    }
    return createPresetMaterial(preset);
  }, [preset]);

  const meshNode = useMemo(() => {
    const group = new THREE.Group();
    if (geometry) group.add(new THREE.Mesh(geometry, material));
    return group;
  }, [geometry, material]);

  const isGem = isGemPresetId(preset);
  const hdrFile = isGem ? GEM_HDR_FILE_BY_LIGHTING[lighting] : HDR_FILE_BY_LIGHTING[lighting];
  const bg = isGem ? GEM_BG_BY_LIGHTING[lighting] : BG_BY_LIGHTING[lighting];
  const ambient = isGem ? GEM_AMBIENT_BY_LIGHTING[lighting] : AMBIENT_BY_LIGHTING[lighting];
  const spot = isGem ? GEM_SPOT_BY_LIGHTING[lighting] : SPOT_BY_LIGHTING[lighting];
  const exposure = TONE_EXPOSURE_BY_LIGHTING[lighting];
  const contactShadow = CONTACT_SHADOW_OPACITY[lighting];

  return (
    <>
    <WebGPUCanvas
      className="h-full w-full touch-none"
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 1.9, 3.8], fov: 40, near: 0.01, far: 200 }}
    >
      <color attach="background" args={[bg]} />
      <ambientLight intensity={ambient} />
      <spotLight
        position={[4, 6, 4]}
        angle={0.35}
        penumbra={0.9}
        intensity={spot}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Suspense fallback={null}>
        <Center key={preset}>
          <GemGpuDiamondShimmer object={meshNode} active={isGem} />
          <primitive object={meshNode} />
        </Center>
        <Environment files={hdrFile} background={false} />
        <ViewerContactShadows
          position={[0, -0.55, 0]}
          color="#0a0a0a"
          opacity={contactShadow}
          scale={12}
          blur={2.5}
          far={4.5}
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.06}
          minDistance={0.4}
          maxDistance={20}
          target={[0, 0, 0]}
          autoRotate={autoRotate}
          autoRotateSpeed={0.6}
        />
        <ViewerPostFX />
        <RenderFidelityBridge exposure={exposure} />
        <ScreenshotBridge />
        <TransparentCaptureBridge />
        <HiresExportBridge />
        <VideoCaptureBridge />
        <OrbitControlsBridge />
      </Suspense>
    </WebGPUCanvas>
    <GemFireOverlay
      geometry={geometry}
      preset={isGem ? (preset as GemPresetId) : null}
      hdrFile={hdrFile}
      background={bg}
      paused={autoRotate}
    />
    </>
  );
}
