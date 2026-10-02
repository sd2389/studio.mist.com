"use client";

import { Center, OrbitControls } from "@react-three/drei";
import { Suspense, type ReactNode } from "react";
import { JEWELRY_MODEL_ROOT_KEY } from "@/features/scene-setups";
import {
  HiresExportBridge,
  OrbitControlsBridge,
  RenderFidelityBridge,
  ScreenshotBridge,
  TransparentCaptureBridge,
  VideoCaptureBridge,
} from "@/features/render";
import { ViewerContactShadows } from "@/lib/gpu/ViewerContactShadows";
import { WebGPUCanvas } from "@/lib/gpu/WebGPUCanvas";
import { KEY_LIGHT_POSITION, LIGHTING_PRESETS } from "@/lib/viewer-lighting";
import type { LightingPresetId } from "@/stores/material-preset-store";
import { GemScopeBridge } from "./GemScopeBridge";
import { SceneEnvironmentBridge } from "./SceneEnvironmentBridge";
import { ViewerPostFX } from "./ViewerPostFX";

type StudioCanvasProps = {
  lighting: LightingPresetId;
  autoRotate: boolean;
  camera: { position: [number, number, number]; fov: number };
  /** A loose stone sits on the gem backdrop instead of the jewelry one. */
  gemBackdrop?: boolean;
  /**
   * Catalogue thumbnail: lights and a slow turntable only — no shadows, post-processing or
   * export plumbing, so a page of tiles stays light.
   */
  tile?: boolean;
  children: ReactNode;
};

/**
 * One lit studio for any jewelry or stone view: lighting preset, metal HDR and gem tent,
 * key light and contact shadow, orbit controls, post-processing, and the bridges the studio
 * sidebar's exports and ASET scope talk to. Pages pass only what they show.
 */
export function StudioCanvas({ lighting, autoRotate, camera, gemBackdrop = false, tile = false, children }: StudioCanvasProps) {
  const background = LIGHTING_PRESETS[lighting][gemBackdrop ? "gemBackground" : "background"];
  return (
    <WebGPUCanvas
      className="h-full w-full touch-none"
      shadows={!tile}
      dpr={[1, 2]}
      camera={{ ...camera, near: 0.01, far: 200 }}
    >
      {/* A tile shows its card's own backdrop through the canvas. */}
      {tile ? null : <color attach="background" args={[background]} />}
      <ambientLight intensity={LIGHTING_PRESETS[lighting].ambient} />
      {tile ? null : (
        <spotLight
          position={KEY_LIGHT_POSITION}
          angle={0.35}
          penumbra={0.9}
          intensity={LIGHTING_PRESETS[lighting].spot}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
      )}
      <Suspense fallback={null}>
        <group userData={{ [JEWELRY_MODEL_ROOT_KEY]: true }}>
          <Center>{children}</Center>
        </group>
        <SceneEnvironmentBridge
          metal={{ file: LIGHTING_PRESETS[lighting].hdr, rotation: 0, intensity: 1 }}
          gem={{ file: null, tent: LIGHTING_PRESETS[lighting].gemTent, rotation: 0, intensity: 1 }}
        />
        <OrbitControls
          makeDefault={!tile}
          enableDamping
          dampingFactor={0.06}
          enableZoom={!tile}
          enablePan={!tile}
          minDistance={0.4}
          maxDistance={20}
          target={[0, 0, 0]}
          autoRotate={autoRotate}
          autoRotateSpeed={tile ? 1.1 : 0.6}
        />
        <RenderFidelityBridge exposure={LIGHTING_PRESETS[lighting].exposure} />
        {tile ? null : (
          <>
            <ViewerContactShadows
              position={[0, -0.55, 0]}
              color="#0a0a0a"
              opacity={LIGHTING_PRESETS[lighting].contactShadow}
              scale={12}
              blur={2.5}
              far={4.5}
            />
            <ViewerPostFX />
            <ScreenshotBridge />
            <TransparentCaptureBridge />
            <HiresExportBridge />
            <VideoCaptureBridge />
            <OrbitControlsBridge />
            <GemScopeBridge />
          </>
        )}
      </Suspense>
    </WebGPUCanvas>
  );
}
