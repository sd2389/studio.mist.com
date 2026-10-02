"use client";

import { Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { WebGPUCanvas } from "@/lib/gpu/WebGPUCanvas";
import {
  HiresExportBridge,
  OrbitControlsBridge,
  RenderFidelityBridge,
  ScreenshotBridge,
  TransparentCaptureBridge,
  VideoCaptureBridge,
} from "@/features/render";
import { SceneSetupStage } from "@/features/scene-setups";
import { ViewerPostFX } from "./ViewerPostFX";
import { JewelryModel } from "./JewelryModel";
import { JewelryGemCompileFallbackBridge } from "./JewelryGemCompileFallbackBridge";
import { JewelryGemTimeBridge } from "./JewelryGemTimeBridge";
import { GemScopeBridge } from "./GemScopeBridge";
import { SceneEnvironmentBridge } from "./SceneEnvironmentBridge";
import { ScenePoseBridge } from "./ScenePoseBridge";
import { ViewerToastHost } from "./ViewerToastHost";
import type { BackgroundItem, EnvironmentItem, GroundItem } from "@/lib/catalog/types";
import { resolveCanvasLook } from "../domain/canvas-look";
import { KEY_LIGHT_POSITION } from "@/lib/viewer-lighting";
import type { PersistedModelConfig, SceneSettingsBuckets } from "@/lib/slot-materials/model-config";
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
  const advanced = sceneSettings?.advanced;
  const look = resolveCanvasLook({
    lighting,
    sceneSettings,
    metalEnvironment,
    gemEnvironment,
    backgroundItem,
    groundItem,
  });
  const { photometric, spot } = look;

  return (
    <div className="relative h-full w-full">
      <WebGPUCanvas
        className="h-full w-full touch-none"
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, dprCap]}
        camera={{ position: [0.62, 0.88, 2.25], fov: 42, near: 0.01, far: 200 }}
      >
        {look.background ? <color attach="background" args={[look.background]} /> : null}
        <ambientLight intensity={look.ambient} />
        <spotLight
          position={KEY_LIGHT_POSITION}
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
            key={modelUrl}
            url={modelUrl}
            preset={preset}
            modelConfig={modelConfig}
            modelTransform={sceneSettings?.modelTransform}
          />
          <Environment files={look.metal.file} background={false} />
          <SceneEnvironmentBridge metal={look.metal} gem={look.gem} />
          <SceneSetupStage setup={look.stage} background={look.floorBackground} />
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
          <RenderFidelityBridge exposure={look.exposure} advanced={advanced} />
          <ScreenshotBridge />
          <TransparentCaptureBridge />
          <HiresExportBridge />
          <VideoCaptureBridge />
          <JewelryGemTimeBridge />
          <JewelryGemCompileFallbackBridge />
          <GemScopeBridge photometric={photometric} />
          <OrbitControlsBridge />
        </Suspense>
      </WebGPUCanvas>
      <ViewerToastHost />
    </div>
  );
}
