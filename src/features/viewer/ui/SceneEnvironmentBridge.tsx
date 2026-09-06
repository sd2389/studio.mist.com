"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

type SceneEnvironmentBridgeProps = {
  rotationRadians: number;
  intensity: number;
};

/** Applies per-scene HDRI rotation and intensity on the Three.js scene. */
export function SceneEnvironmentBridge({ rotationRadians, intensity }: SceneEnvironmentBridgeProps) {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Synchronizes the externally owned Three.js scene.
    scene.environmentRotation = new THREE.Euler(0, rotationRadians, 0);
    scene.environmentIntensity = intensity;
  }, [intensity, rotationRadians, scene]);

  return null;
}
