"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";

/** Set on the jewelry model's root group so the set can be built around it. */
export const JEWELRY_MODEL_ROOT_KEY = "jewelryModelRoot" as const;

export type ModelBounds = {
  /** World-space height the piece rests at. */
  floorY: number;
  /** Horizontal half-extent, for sizing plinths and prop rings. */
  radius: number;
  centerX: number;
  centerZ: number;
};

const REMEASURE_EVERY_FRAMES = 20;
const box = new THREE.Box3();

function findModelRoot(scene: THREE.Scene): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  scene.traverse((object) => {
    if (!found && object.userData[JEWELRY_MODEL_ROOT_KEY] === true) found = object;
  });
  return found;
}

function measure(root: THREE.Object3D): ModelBounds | null {
  box.setFromObject(root);
  if (box.isEmpty()) return null;
  return {
    floorY: box.min.y,
    radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
    centerX: (box.min.x + box.max.x) / 2,
    centerZ: (box.min.z + box.max.z) / 2,
  };
}

function boundsKey(b: ModelBounds): string {
  return [b.floorY, b.radius, b.centerX, b.centerZ].map((v) => v.toFixed(3)).join(",");
}

/**
 * Bounds of the jewelry model, re-measured every few frames so the floor follows model
 * swaps and transform edits without re-rendering React on every frame.
 */
export function useModelBounds(): ModelBounds | null {
  const scene = useThree((state) => state.scene);
  const [bounds, setBounds] = useState<ModelBounds | null>(null);
  const lastKey = useRef("");
  const frame = useRef(0);

  useFrame(() => {
    if (frame.current++ % REMEASURE_EVERY_FRAMES !== 0) return;
    const root = findModelRoot(scene);
    const next = root ? measure(root) : null;
    if (!next) return;
    const key = boundsKey(next);
    if (key === lastKey.current) return;
    lastKey.current = key;
    setBounds(next);
  });

  return bounds;
}
