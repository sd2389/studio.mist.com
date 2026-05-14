"use client";

import { Canvas } from "@react-three/fiber";
import { Center, ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { GemGpuDiamondShimmer } from "@/components/DiamondGem";
import { HiresExportBridge } from "@/components/viewer/HiresExportBridge";
import { OrbitControlsBridge } from "@/components/viewer/OrbitControlsBridge";
import { ScreenshotBridge } from "@/components/viewer/ScreenshotBridge";
import { TransparentCaptureBridge } from "@/components/viewer/TransparentCaptureBridge";
import { VideoCaptureBridge } from "@/components/viewer/VideoCaptureBridge";
import { ViewerPostFX } from "@/components/viewer/ViewerPostFX";
import { createPresetMaterial } from "@/lib/material-presets";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import type { CutInfo } from "@/lib/stones/cut-geometries";
import {
  AMBIENT_BY_LIGHTING,
  BG_BY_LIGHTING,
  CONTACT_SHADOW_OPACITY,
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
  const geometry = useMemo(() => cut.build(), [cut]);
  const material = useMemo<THREE.Material>(() => {
    if (preset === "original") {
      return new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.85, roughness: 0.3 });
    }
    return createPresetMaterial(preset);
  }, [preset]);

  const meshNode = useMemo(() => {
    const m = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(m);
    return group;
  }, [geometry, material]);

  const hdrFile = HDR_FILE_BY_LIGHTING[lighting];
  const bg = BG_BY_LIGHTING[lighting];
  const ambient = AMBIENT_BY_LIGHTING[lighting];
  const spot = SPOT_BY_LIGHTING[lighting];
  const exposure = TONE_EXPOSURE_BY_LIGHTING[lighting];
  const contactShadow = CONTACT_SHADOW_OPACITY[lighting];

  return (
    <Canvas
      className="h-full w-full touch-none"
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.35, 2.2], fov: 45, near: 0.01, far: 200 }}
      gl={{ alpha: true, preserveDrawingBuffer: true, antialias: true, toneMappingExposure: exposure }}
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
          <GemGpuDiamondShimmer object={meshNode} active={isGemPresetId(preset)} />
          <primitive object={meshNode} />
        </Center>
        <Environment files={hdrFile} background={false} />
        <ContactShadows
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
        <ScreenshotBridge />
        <TransparentCaptureBridge />
        <HiresExportBridge />
        <VideoCaptureBridge />
        <OrbitControlsBridge />
      </Suspense>
    </Canvas>
  );
}
