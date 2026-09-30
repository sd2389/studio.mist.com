"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  enableJewelryGemSafeMode,
  JEWELRY_GEM_SHADER_KEY,
} from "@/lib/gem-gpu/jewelry-gem-shader";
import { asViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { useViewerToastStore } from "@/stores/viewer-toast-store";

const SAFE_MODE_TOAST = "Gem preview unavailable — retrying safe mode";

function applySafeModeToJewelryGems(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshPhysicalMaterial)) continue;
      if (!m.userData?.[JEWELRY_GEM_SHADER_KEY]) continue;
      if (m.userData.jewelryGemSafeMode === true) continue;
      enableJewelryGemSafeMode(m);
      count += 1;
    }
  });
  return count;
}

/**
 * On jewelry-gem WebGPU compile failure, toast once and switch to the
 * simpler jewelry-gem-safe TSL path (never silent stock glass).
 */
export function JewelryGemCompileFallbackBridge() {
  const gl = asViewerRenderer(useThree((s) => s.gl));
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const toastedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void gl.compileAsync(scene, camera).catch((error: unknown) => {
      if (cancelled) return;
      console.error("[jewelry-gem] WebGPU compile failed", error);
      if (applySafeModeToJewelryGems(scene) === 0) return;
      if (toastedRef.current) return;
      toastedRef.current = true;
      useViewerToastStore.getState().showToast(SAFE_MODE_TOAST);
    });
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera]);

  return null;
}
