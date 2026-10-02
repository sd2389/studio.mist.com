"use client";

import * as THREE from "three";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { isGemPresetId, type GemPresetId } from "@/lib/gem-gpu/gem-configs";
import { prepareGemTraceMesh } from "@/lib/gem-gpu/gem-trace-material";
import { designedMaterialOf, getRole } from "@/lib/jewelry/assembly";
import { createPresetMaterial } from "@/lib/material-presets";
import type { MaterialPresetId } from "@/stores/material-preset-store";

/**
 * Materials for gallery pieces. One material per preset id is shared by every tile and the
 * detail viewer (a traced gem material compiles a shader; making one per tile per render
 * would stall the page).
 */

const cache = new Map<string, THREE.Material>();

function materialFor(id: string, kind: "metal" | "gem"): THREE.Material {
  const key = `${kind}:${id}`;
  let m = cache.get(key);
  if (!m) {
    m = kind === "gem" ? createGemMaterial(id as GemPresetId) : createPresetMaterial(id as Exclude<MaterialPresetId, "original">);
    cache.set(key, m);
  }
  return m;
}

function assign(mesh: THREE.Mesh, material: THREE.Material, isGem: boolean): void {
  mesh.material = material;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (isGem) prepareGemTraceMesh(mesh);
}

/**
 * "original" shows each piece as designed; a metal preset recolours the metal, a gem
 * preset recolours the stones (metal then stays as designed).
 */
export function applyGalleryMaterials(root: THREE.Object3D, preset: MaterialPresetId = "original"): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const role = getRole(o);
    const designed = designedMaterialOf(o);
    if (!role || !designed) return;
    const isGem = role !== "metal";
    if (preset !== "original" && isGem === isGemPresetId(preset)) {
      assign(o, materialFor(preset, isGem ? "gem" : "metal"), isGem);
      return;
    }
    assign(o, materialFor(designed.id, designed.kind), isGem);
  });
}
