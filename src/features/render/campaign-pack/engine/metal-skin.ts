import * as THREE from "three";
import { GEM_GPU_USER_KEY } from "@/lib/gem-gpu/gem-physical-material";
import { createPresetMaterial } from "@/lib/material-presets";
import { detectSlots, type PersistedSlotTokens } from "@/lib/slot-materials/detect-slots";
import { isGemSlot } from "@/lib/slot-materials/material-rules";
import type { FinishId, MaterialPresetId } from "@/stores/material-preset-store";

/** One material slot on one mesh of the export clone that a metal preset re-skins. */
export type SkinTarget = {
  mesh: THREE.Mesh;
  /** Index into a multi-material array, or null for a single material. */
  index: number | null;
  original: THREE.Material;
};

/** Metal env captured from the live scene (see environment-probe.ts). */
export type MetalEnvironment = {
  texture: THREE.Texture | null;
  rotation: THREE.Euler;
  intensityScale: number;
};

const GEM_USER_KEYS = [GEM_GPU_USER_KEY, "gemTrace", "jewelryGemShader"];
const METAL_ROLE = "metal";

export function isGemLikeMaterial(material: THREE.Material): boolean {
  if (GEM_USER_KEYS.some((key) => Boolean(material.userData?.[key]))) return true;
  return material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0;
}

function isGemRole(mesh: THREE.Mesh): boolean {
  const role = mesh.userData?.jewelryRole;
  return role === "gem" || role === "accent-gem";
}

type SlotKind = "gem" | "metal" | "unknown";

function slotKinds(root: THREE.Object3D, slotTokens?: PersistedSlotTokens): Map<THREE.Mesh, SlotKind> {
  const kinds = new Map<THREE.Mesh, SlotKind>();
  for (const [slot, meshes] of detectSlots(root, slotTokens)) {
    const kind: SlotKind = slot === "default" ? "unknown" : isGemSlot(slot) ? "gem" : "metal";
    for (const mesh of meshes) kinds.set(mesh, kind);
  }
  return kinds;
}

/**
 * Metal surface = not a gem by slot, role or material, and either on a metal slot, tagged
 * metal, or already metallic. Enamel, pearls and ground planes are left alone.
 */
export function isMetalSurface(mesh: THREE.Mesh, material: THREE.Material, slot: SlotKind): boolean {
  if (slot === "gem" || isGemRole(mesh) || isGemLikeMaterial(material)) return false;
  if (!(material instanceof THREE.MeshStandardMaterial)) return false;
  if (slot === "metal" || mesh.userData?.jewelryRole === METAL_ROLE) return true;
  return material.metalness >= 0.5;
}

export function collectMetalSkinTargets(
  root: THREE.Object3D,
  slotTokens?: PersistedSlotTokens,
): SkinTarget[] {
  const kinds = slotKinds(root, slotTokens);
  const targets: SkinTarget[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const slot = kinds.get(object) ?? "unknown";
    if (Array.isArray(object.material)) {
      object.material.forEach((material, index) => {
        if (isMetalSurface(object, material, slot)) targets.push({ mesh: object, index, original: material });
      });
    } else if (isMetalSurface(object, object.material, slot)) {
      targets.push({ mesh: object, index: null, original: object.material });
    }
  });
  return targets;
}

/** Points every target at `material`, or back at its original when null. */
export function applyMetalSkin(targets: SkinTarget[], material: THREE.Material | null): void {
  for (const target of targets) {
    const next = material ?? target.original;
    if (target.index === null) {
      target.mesh.material = next;
    } else if (Array.isArray(target.mesh.material)) {
      const materials = [...target.mesh.material];
      materials[target.index] = next;
      target.mesh.material = materials;
    }
  }
}

/** The same metal material the studio would build, lit by the studio's metal environment. */
export function createMetalSkinMaterial(
  metal: Exclude<MaterialPresetId, "original">,
  finish: FinishId,
  environment: MetalEnvironment | null,
): THREE.Material {
  const material = createPresetMaterial(metal, finish);
  if (material instanceof THREE.MeshStandardMaterial && environment) {
    if (environment.texture) material.envMap = environment.texture;
    material.envMapRotation.copy(environment.rotation);
    material.envMapIntensity *= environment.intensityScale;
    material.needsUpdate = true;
  }
  return material;
}
