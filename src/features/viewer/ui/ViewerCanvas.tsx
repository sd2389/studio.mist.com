"use client";

import { Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { WebGPUCanvas } from "@/lib/gpu/WebGPUCanvas";
import { ViewerContactShadows } from "@/lib/gpu/ViewerContactShadows";
import {
  HiresExportBridge,
  OrbitControlsBridge,
  RenderFidelityBridge,
  ScreenshotBridge,
  TransparentCaptureBridge,
  VideoCaptureBridge,
} from "@/features/render";
import { ViewerPostFX } from "./ViewerPostFX";
import { JewelryModel } from "./JewelryModel";
import { JewelryGemCompileFallbackBridge } from "./JewelryGemCompileFallbackBridge";
import { JewelryGemTimeBridge } from "./JewelryGemTimeBridge";
import { SceneEnvironmentBridge } from "./SceneEnvironmentBridge";
import { ScenePoseBridge } from "./ScenePoseBridge";
import { ViewerToastHost } from "./ViewerToastHost";
import {
  backgroundColorForCanvas,
  groundParamsFromItem,
  resolveEnvironmentUrl,
} from "@/lib/catalog/scene-appearance";
import type { BackgroundItem, EnvironmentItem, GroundItem } from "@/lib/catalog/types";
import { resolveSourceAssetUrl } from "@/lib/source-catalog";
import {
  AMBIENT_BY_LIGHTING,
  BG_BY_LIGHTING,
  HDR_FILE_BY_LIGHTING,
  SPOT_BY_LIGHTING,
  TONE_EXPOSURE_BY_LIGHTING,
} from "@/lib/viewer-lighting";
import {
  degreesToRadians,
  envIntensityMultiplier,
  envRotationDegrees,
} from "@/lib/viewer-scene";
import type {
  PersistedModelConfig,
  RenderQualityMode,
  SceneSettingsBuckets,
} from "@/lib/slot-materials/model-config";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { useViewerQualityStore } from "@/stores/viewer-quality-store";

type ViewerCanvasProps = {
  modelUrl: string;
  preset: MaterialPresetId;
  autoRotate: boolean;
  lighting: LightingPresetId;
  modelConfig?: PersistedModelConfig;
  sceneSettings?: SceneSettingsBuckets;
  metalEnvironment?: EnvironmentItem | null;
  gemEnvironment?: EnvironmentItem | null;
  backgroundItem?: BackgroundItem | null;
  groundItem?: GroundItem | null;
};

export function ViewerCanvas({
  modelUrl,
  preset,
  autoRotate,
  lighting,
  modelConfig,
  sceneSettings,
  metalEnvironment = null,
  gemEnvironment = null,
  backgroundItem = null,
  groundItem = null,
}: ViewerCanvasProps) {
  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === "string") {
        if (first.includes("THREE.Clock: This module has been deprecated")) return;
        if (first.includes("THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated")) return;
      }
      originalWarn(...args);
    };
    return () => {
      console.warn = originalWarn;
    };
  }, []);

  const dprCap = useViewerQualityStore((s) => s.effective.dprCap);
  const isGemView = isGemPresetId(preset);
  const activeEnvironment = isGemView
    ? gemEnvironment ?? metalEnvironment
    : metalEnvironment ?? gemEnvironment;
  const envKind = isGemView ? "gem" : "metal";

  const qualityMode: RenderQualityMode =
    sceneSettings?.quality_mode === "photometric" ? "photometric" : "standard";
  const photometric = qualityMode === "photometric";
  const advanced = sceneSettings?.advanced;

  const legacyEnvValue = isGemView
    ? sceneSettings?.["ENVIRONMENT-GEM"] || sceneSettings?.["ENVIRONMENT-METAL"]
    : sceneSettings?.["ENVIRONMENT-METAL"] || sceneSettings?.["ENVIRONMENT-GEM"];

  const hdrFile = activeEnvironment
    ? resolveEnvironmentUrl(activeEnvironment, HDR_FILE_BY_LIGHTING[lighting])
    : legacyEnvValue
      ? resolveSourceAssetUrl(legacyEnvValue)
      : HDR_FILE_BY_LIGHTING[lighting];

  const envRotation = degreesToRadians(
    envRotationDegrees(advanced, envKind, activeEnvironment?.default_rotation ?? 0),
  );
  const envIntensity = envIntensityMultiplier(
    advanced,
    envKind,
    activeEnvironment?.default_intensity ?? 1,
  );

  const fallbackBg = photometric ? "#E8E4DC" : BG_BY_LIGHTING[lighting];
  const bg = backgroundColorForCanvas(
    backgroundItem,
    sceneSettings?.customBackground,
    fallbackBg,
  );
  const ambient = photometric ? AMBIENT_BY_LIGHTING[lighting] * 0.74 : AMBIENT_BY_LIGHTING[lighting];
  const spot = photometric ? SPOT_BY_LIGHTING[lighting] * 1.08 : SPOT_BY_LIGHTING[lighting];
  const exposureBase = photometric
    ? TONE_EXPOSURE_BY_LIGHTING[lighting] * 0.92
    : TONE_EXPOSURE_BY_LIGHTING[lighting];
  const exposure = advanced?.exposure ? exposureBase * advanced.exposure : exposureBase;

  const ground = groundParamsFromItem(groundItem);
  const legacyGroundNone = sceneSettings?.GROUND?.toLowerCase().includes("none");
  const contactShadow = !ground.enabled || legacyGroundNone ? 0 : ground.opacity;
  const contactBlur = ground.blur || (photometric ? 2.1 : 2.5);

  return (
    <div className="relative h-full w-full">
      <WebGPUCanvas
        className="h-full w-full touch-none"
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, dprCap]}
        camera={{ position: [0, 0.35, 2.2], fov: 45, near: 0.01, far: 200 }}
      >
        {bg ? <color attach="background" args={[bg]} /> : null}
        <ambientLight intensity={ambient} />
        <spotLight
          position={[4, 6, 4]}
          angle={0.35}
          penumbra={0.9}
          intensity={spot}
          castShadow
          shadow-mapSize={photometric ? [2048, 2048] : [1024, 1024]}
        />
        {photometric ? (
          <spotLight
            position={[-4, 2.3, -3]}
            angle={0.4}
            penumbra={0.95}
            intensity={spot * 0.38}
            castShadow={false}
          />
        ) : null}
        <Suspense fallback={null}>
          <JewelryModel
            key={preset}
            url={modelUrl}
            preset={preset}
            modelConfig={modelConfig}
            modelTransform={sceneSettings?.modelTransform}
          />
          <Environment files={hdrFile} background={false} />
          <SceneEnvironmentBridge rotationRadians={envRotation} intensity={envIntensity} />
          <ViewerContactShadows
            position={[0, -0.55, 0]}
            color="#0a0a0a"
            opacity={contactShadow}
            scale={12}
            blur={contactBlur}
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
          <ScenePoseBridge
            activePoseId={sceneSettings?.activePoseId}
            savedPoses={sceneSettings?.poses}
          />
          <ViewerPostFX advanced={advanced} />
          <RenderFidelityBridge exposure={exposure} advanced={advanced} />
          <ScreenshotBridge />
          <TransparentCaptureBridge />
          <HiresExportBridge />
          <VideoCaptureBridge />
          <JewelryGemTimeBridge />
          <JewelryGemCompileFallbackBridge />
          <OrbitControlsBridge />
        </Suspense>
      </WebGPUCanvas>
      <ViewerToastHost />
    </div>
  );
}
