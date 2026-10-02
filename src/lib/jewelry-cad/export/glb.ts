import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeIndexed } from "@/lib/jewelry-cad/geometry/merge";
import { partToMesh } from "@/lib/jewelry-cad/scene";
import { getCadGem } from "@/lib/jewelry-cad/stones/gem-types";
import { getCadMetal } from "@/lib/jewelry-cad/units/metals";
import type { BuiltPart } from "@/lib/jewelry-cad/types";
import { presetSwatchHex } from "@/lib/material-colors";

/**
 * GLB through three's GLTFExporter. Node names, material names and `extras.jewelryRole`
 * all carry the slot, so the file drops straight into the studio's upload flow (which
 * reads slots from names) and keeps its materials in any other glTF viewer.
 *
 * Units are millimetres like the CAD source — the studio fits models to its stage, and
 * its gem shading is tuned for millimetre-scale stones.
 */

export type GlbOptions = {
  /** Uniform scale baked into the vertices (1 = mm). */
  scale?: number;
  /** Fold `Heads` into `Metal 1` (for consumers that expect exactly Metal 1 + Gem 1). */
  mergeMetal?: boolean;
  /** Root node name; keep it free of slot words ("band", "stone"…) — see detect-slots. */
  rootName?: string;
};

/** GLTFExporter reads its output through FileReader, which Node lacks. */
function ensureFileReader(): void {
  if (typeof (globalThis as { FileReader?: unknown }).FileReader !== "undefined") return;
  class BlobReader {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  }
  (globalThis as { FileReader?: unknown }).FileReader = BlobReader;
}

export function exportMaterialFor(part: BuiltPart): THREE.Material {
  if (part.role === "metal") {
    const metal = part.metal ? getCadMetal(part.metal) : null;
    return new THREE.MeshStandardMaterial({ name: part.slot, color: (metal && presetSwatchHex(metal.id)) ?? "#d4d4d6", metalness: 1, roughness: 0.16 });
  }
  const gem = part.gem ? getCadGem(part.gem) : null;
  return new THREE.MeshPhysicalMaterial({
    name: part.slot,
    color: (gem && presetSwatchHex(gem.material)) ?? "#ffffff",
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    ior: gem?.ior ?? 2.417,
    thickness: 1,
  });
}

function foldMetal(parts: BuiltPart[]): BuiltPart[] {
  const metal = parts.filter((p) => p.role === "metal");
  if (metal.length < 2) return parts;
  const merged: BuiltPart = { ...metal[0]!, slot: "Metal 1", geometry: mergeIndexed(metal.map((p) => p.geometry)) };
  return [merged, ...parts.filter((p) => p.role !== "metal")];
}

export function buildExportScene(parts: BuiltPart[], options: GlbOptions = {}): THREE.Group {
  const chosen = options.mergeMetal ? foldMetal(parts) : parts;
  const root = new THREE.Group();
  root.name = options.rootName ?? "MIST Design";
  const scale = options.scale ?? 1;
  for (const part of chosen) {
    const geometry = part.geometry.clone();
    if (scale !== 1) geometry.scale(scale, scale, scale);
    const mesh = partToMesh({ ...part, geometry }, exportMaterialFor(part));
    root.add(mesh);
  }
  return root;
}

export async function exportGlb(parts: BuiltPart[], options: GlbOptions = {}): Promise<ArrayBuffer> {
  ensureFileReader();
  const scene = buildExportScene(parts, options);
  const result = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false });
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    (o.material as THREE.Material).dispose();
  });
  if (!(result instanceof ArrayBuffer)) throw new Error("GLTFExporter did not return a binary GLB");
  return result;
}
