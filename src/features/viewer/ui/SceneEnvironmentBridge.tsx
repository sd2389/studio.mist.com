"use client";

import { useEnvironment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { createJewelryEnvironmentApplicator } from "@/lib/apply-jewelry-environments";

type EnvironmentSettings = { file: string; rotation: number; intensity: number };
type SceneEnvironmentBridgeProps = { metal: EnvironmentSettings; gem: EnvironmentSettings };

/** Assign independent HDR lighting to metal and gem materials, including new swatch materials. */
export function SceneEnvironmentBridge({ metal, gem }: SceneEnvironmentBridgeProps) {
  const metalTexture = useEnvironment({ files: metal.file });
  const gemTexture = useEnvironment({ files: gem.file });
  const apply = useMemo(() => createJewelryEnvironmentApplicator(), []);
  useFrame(({ scene }) => {
    apply(scene, { texture: metalTexture, ...metal }, { texture: gemTexture, ...gem });
  });
  return null;
}
