"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { Suspense } from "react";
import { HiresExportBridge } from "@/components/viewer/HiresExportBridge";
import { JewelryModel } from "@/components/viewer/JewelryModel";
import { OrbitControlsBridge } from "@/components/viewer/OrbitControlsBridge";
import { ScreenshotBridge } from "@/components/viewer/ScreenshotBridge";
import { TransparentCaptureBridge } from "@/components/viewer/TransparentCaptureBridge";
import { VideoCaptureBridge } from "@/components/viewer/VideoCaptureBridge";
import { ViewerPostFX } from "@/components/viewer/ViewerPostFX";
import { resolveGemoraAssetUrl } from "@/lib/gemora-catalog";
import {
  AMBIENT_BY_LIGHTING,
  BG_BY_LIGHTING,
  CONTACT_SHADOW_OPACITY,
  HDR_FILE_BY_LIGHTING,
  SPOT_BY_LIGHTING,
  TONE_EXPOSURE_BY_LIGHTING,
} from "@/lib/viewer-lighting";
import type { PersistedModelConfig, SceneSettingsBuckets } from "@/lib/slot-materials/model-config";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";

type ViewerCanvasProps = {
  modelUrl: string;
  preset: MaterialPresetId;
  autoRotate: boolean;
  lighting: LightingPresetId;
  modelConfig?: PersistedModelConfig;
  sceneSettings?: SceneSettingsBuckets;
};

function backgroundFromSceneValue(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const token = value.toLowerCase();
  if (token.includes("black")) return "#0a0a0a";
  if (token.includes("white")) return "#f8f8f8";
  if (token.includes("gray") || token.includes("grey")) return "#b6b7ba";
  if (token.includes("blue")) return "#dbeafe";
  if (token.includes("beige")) return "#f5ead6";
  if (token.includes("red")) return "#fee2e2";
  return fallback;
}

export function ViewerCanvas({
  modelUrl,
  preset,
  autoRotate,
  lighting,
  modelConfig,
  sceneSettings,
}: ViewerCanvasProps) {
  const hdrFile = sceneSettings?.["ENVIRONMENT-METAL"]
    ? resolveGemoraAssetUrl(sceneSettings["ENVIRONMENT-METAL"])
    : HDR_FILE_BY_LIGHTING[lighting];
  const bg = backgroundFromSceneValue(sceneSettings?.BACKGROUND, BG_BY_LIGHTING[lighting]);
  const ambient = AMBIENT_BY_LIGHTING[lighting];
  const spot = SPOT_BY_LIGHTING[lighting];
  const exposure = TONE_EXPOSURE_BY_LIGHTING[lighting];
  const contactShadow = sceneSettings?.GROUND?.toLowerCase().includes("none")
    ? 0
    : CONTACT_SHADOW_OPACITY[lighting];

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
        <JewelryModel key={preset} url={modelUrl} preset={preset} modelConfig={modelConfig} />
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
