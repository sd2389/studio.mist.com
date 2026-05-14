"use client";

import { useRef, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GEM_CONFIGS } from "@/lib/gem-gpu/gem-configs";
import {
  gemPresetIdFromMaterial,
  isGemGpuMaterial,
} from "@/lib/gem-gpu/gem-physical-material";

export { GEMGPU_DIAMOND } from "@/lib/gem-gpu/diamond-config";
export {
  createGemMaterial,
  createGemGpuDiamondMaterial,
  isGemGpuMaterial,
  isGemGpuDiamondMaterial,
} from "@/lib/gem-gpu/gem-physical-material";

type AnimatedGem = {
  material: THREE.MeshPhysicalMaterial;
  base: number;
  amplitude: number;
};

export function useGemShimmer(root: THREE.Object3D, active: boolean): void {
  const gemsRef = useRef<AnimatedGem[]>([]);
  const rootIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (active) {
      rootIdRef.current = null;
      gemsRef.current = [];
    }
  }, [active, root]);

  useFrame(() => {
    if (!active) {
      gemsRef.current = [];
      return;
    }
    if (rootIdRef.current !== root.uuid) {
      rootIdRef.current = root.uuid;
      gemsRef.current = [];
    }
    if (gemsRef.current.length === 0) {
      const list: AnimatedGem[] = [];
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) {
          if (!isGemGpuMaterial(m)) continue;
          const id = gemPresetIdFromMaterial(m);
          if (!id) continue;
          const cfg = GEM_CONFIGS[id];
          list.push({
            material: m,
            base: cfg.dispersionBase,
            amplitude: cfg.dispersionAmplitude,
          });
        }
      });
      gemsRef.current = list;
    }
    const t = performance.now() * 0.001;
    const wave = Math.sin(t * 0.9);
    const gems = gemsRef.current;
    for (let i = 0; i < gems.length; i += 1) {
      const g = gems[i]!;
      g.material.dispersion = g.base + wave * g.amplitude;
    }
  });
}

export const useGemGpuDiamondShimmer = useGemShimmer;

export function GemShimmer({
  object,
  active,
}: {
  object: THREE.Object3D;
  active: boolean;
}) {
  useGemShimmer(object, active);
  return null;
}

export const GemGpuDiamondShimmer = GemShimmer;
