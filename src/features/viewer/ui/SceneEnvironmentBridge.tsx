"use client";

import { useEnvironment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import type * as THREE from "three";
import { createJewelryEnvironmentApplicator } from "@/lib/apply-jewelry-environments";
import { getGemStudioEnvironment, type GemStudioPreset } from "@/lib/gem-gpu/gem-studio-environment";

type EnvironmentSettings = { file: string; rotation: number; intensity: number };
/** `file: null` lights gems with the procedural jewelry tent instead of an HDR file. */
export type GemEnvironmentSettings = {
  file: string | null;
  tent: GemStudioPreset;
  rotation: number;
  intensity: number;
};
type SceneEnvironmentBridgeProps = { metal: EnvironmentSettings; gem: GemEnvironmentSettings };
type ResolvedEnvironment = { texture: THREE.Texture; rotation: number; intensity: number };

function EnvironmentApplier({ metal, gem }: { metal: ResolvedEnvironment; gem: ResolvedEnvironment }) {
  const apply = useMemo(() => createJewelryEnvironmentApplicator(), []);
  useFrame(({ scene }) => {
    apply(scene, metal, gem);
  });
  return null;
}

function HdrGemEnvironment({ metal, gem }: { metal: ResolvedEnvironment; gem: GemEnvironmentSettings & { file: string } }) {
  const gemTexture = useEnvironment({ files: gem.file });
  return (
    <EnvironmentApplier
      metal={metal}
      gem={{ texture: gemTexture, rotation: gem.rotation, intensity: gem.intensity }}
    />
  );
}

/** Assign independent HDR lighting to metal and gem materials, including new swatch materials. */
export function SceneEnvironmentBridge({ metal, gem }: SceneEnvironmentBridgeProps) {
  const metalTexture = useEnvironment({ files: metal.file });
  const resolvedMetal = { texture: metalTexture, rotation: metal.rotation, intensity: metal.intensity };
  if (gem.file) return <HdrGemEnvironment metal={resolvedMetal} gem={{ ...gem, file: gem.file }} />;
  return (
    <EnvironmentApplier
      metal={resolvedMetal}
      gem={{ texture: getGemStudioEnvironment(gem.tent), rotation: gem.rotation, intensity: gem.intensity }}
    />
  );
}
