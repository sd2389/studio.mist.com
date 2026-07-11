"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  enableJewelryGemSafeMode,
  JEWELRY_GEM_SHADER_KEY,
} from "@/lib/gem-gpu/jewelry-gem-shader";
import { useViewerToastStore } from "@/stores/viewer-toast-store";

const SAFE_MODE_TOAST = "Gem preview unavailable — retrying safe mode";

type ShaderErrorHandler = NonNullable<THREE.WebGLRenderer["debug"]["onShaderError"]>;

function shaderInfoLog(
  gl: WebGLRenderingContext,
  shader: WebGLShader,
  label: string,
): string {
  const log = (gl.getShaderInfoLog(shader) || "").trim();
  return log ? `${label}:\n${log}` : `${label}: (no info log)`;
}

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

function installJewelryGemCompileFallback(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  onSafeModeApplied: () => void,
): () => void {
  const previous = renderer.debug.onShaderError;
  renderer.debug.checkShaderErrors = true;

  const handler: ShaderErrorHandler = (context, program, vertexShader, fragmentShader) => {
    const programLog = (context.getProgramInfoLog(program) || "").trim();
    console.error("[jewelry-gem] WebGL program compile/link failed", {
      programLog,
      vertex: shaderInfoLog(context, vertexShader, "vertex"),
      fragment: shaderInfoLog(context, fragmentShader, "fragment"),
    });

    if (applySafeModeToJewelryGems(scene) > 0) {
      onSafeModeApplied();
    }

    if (typeof previous === "function") {
      previous(context, program, vertexShader, fragmentShader);
    }
  };

  renderer.debug.onShaderError = handler;
  return () => {
    renderer.debug.onShaderError = previous;
  };
}

/**
 * On WebGL program link failure, toast once and re-apply jewelry gem shader
 * in qualityReduce safe mode (never silent stock glass).
 */
export function JewelryGemCompileFallbackBridge() {
  const toastedRef = useRef(false);

  useEffect(() => {
    const { gl: renderer, scene } = useThree.getState();
    return installJewelryGemCompileFallback(renderer, scene, () => {
      if (toastedRef.current) return;
      toastedRef.current = true;
      useViewerToastStore.getState().showToast(SAFE_MODE_TOAST);
    });
  }, []);

  return null;
}
