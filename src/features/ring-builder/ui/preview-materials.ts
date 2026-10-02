"use client";

import type * as THREE from "three";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { getCadGem, type BuiltPart, type CadGemId, type CadMetalId } from "@/lib/jewelry-cad";
import { createPresetMaterial } from "@/lib/material-presets";

/**
 * Studio materials for the live preview, one per metal / gem and reused across rebuilds:
 * a gem material compiles a ray-tracing shader, so recreating it per slider tick would
 * stall the preview.
 */

const metals = new Map<CadMetalId, THREE.Material>();
const gems = new Map<string, THREE.Material>();

export function previewMetalMaterial(id: CadMetalId): THREE.Material {
  let m = metals.get(id);
  if (!m) {
    m = createPresetMaterial(id);
    metals.set(id, m);
  }
  return m;
}

export function previewGemMaterial(id: CadGemId): THREE.Material {
  const preset = getCadGem(id).material;
  let m = gems.get(preset);
  if (!m) {
    m = createGemMaterial(preset);
    gems.set(preset, m);
  }
  return m;
}

export function previewMaterialFor(part: BuiltPart): THREE.Material {
  if (part.role === "metal") return previewMetalMaterial(part.metal ?? "platinum");
  return previewGemMaterial(part.gem ?? "diamond");
}
