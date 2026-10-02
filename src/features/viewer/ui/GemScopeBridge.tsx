"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { JEWELRY_MODEL_ROOT_KEY } from "@/features/scene-setups";
import {
  GEM_TRACE_BOUNCES,
  getGemTraceUniforms,
  isGemTraceMaterial,
  setGemTraceBounces,
  setGemTraceScope,
} from "@/lib/gem-gpu/gem-trace-material";
import { useGemScopeStore } from "@/stores/gem-scope-store";

type GemTraceView = { scope: boolean; photometric: boolean };

/** Bounce count each material was created with, so leaving photometric mode restores it. */
const createdBounces = new WeakMap<THREE.Material, number>();

function applyView(material: THREE.Material, view: GemTraceView): void {
  if (!createdBounces.has(material)) createdBounces.set(material, getGemTraceUniforms(material)!.bounces.value);
  setGemTraceScope(material, view.scope);
  setGemTraceBounces(material, view.photometric ? GEM_TRACE_BOUNCES.photometric : createdBounces.get(material)!);
}

function applyToModel(root: THREE.Object3D, view: GemTraceView): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (isGemTraceMaterial(material)) applyView(material, view);
    }
  });
}

/**
 * Per-view gem settings for the piece's own stones (scene props such as the crystal garden's
 * quartz keep photographic shading): the ASET scope, and more traced bounces in
 * photometric mode. Runs every frame so stones swapped in by a material change follow.
 */
export function GemScopeBridge({ photometric = false }: { photometric?: boolean }) {
  const scope = useGemScopeStore((s) => s.mode === "aset");
  useFrame(({ scene }) => {
    for (const child of scene.children) {
      child.traverse((object) => {
        if (object.userData[JEWELRY_MODEL_ROOT_KEY] === true) applyToModel(object, { scope, photometric });
      });
    }
  });
  return null;
}
