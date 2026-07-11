"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  JEWELRY_GEM_SHADER_KEY,
  setJewelryGemTime,
} from "@/lib/gem-gpu/jewelry-gem-shader";

export function JewelryGemTimeBridge() {
  useFrame((state) => {
    state.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m?.userData?.[JEWELRY_GEM_SHADER_KEY]) {
          setJewelryGemTime(m, state.clock.elapsedTime);
        }
      }
    });
  });
  return null;
}
