import * as THREE from "three";
import { createPresetMaterial } from "@/lib/material-presets";
import {
  applySplitGemBandPreset,
  canApplySplitGemBand,
} from "@/lib/gem-gpu/apply-split-diamond";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { detectSlots, type PersistedSlotTokens, type SlotId } from "@/lib/slot-materials/detect-slots";
import type { FinishId, MaterialPresetId } from "@/stores/material-preset-store";

type JewelryRole = "metal" | "gem" | "accent-gem";
const ROLE_KEY = "jewelryRole" as const;

function meshRole(o: THREE.Object3D): JewelryRole | null {
  return (o.userData[ROLE_KEY] as JewelryRole | undefined) ?? null;
}

function hasRoleTaggedMeshes(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if (found) return;
    if (o instanceof THREE.Mesh && meshRole(o)) found = true;
  });
  return found;
}

const ORIGINAL_KEY = "__originalMaterial" as const;

type SavedMaterial = THREE.Material | THREE.Material[];

/**
 * Snapshot each mesh's incoming material(s) so we can revert later when the user
 * picks the "original" preset. Idempotent — only stores the snapshot on the first call.
 */
export function snapshotOriginalMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData[ORIGINAL_KEY]) return;
    const m = obj.material;
    obj.userData[ORIGINAL_KEY] = Array.isArray(m) ? m.map((x) => x.clone()) : m.clone();
  });
}

function restoreOriginal(mesh: THREE.Mesh): void {
  const saved = mesh.userData[ORIGINAL_KEY] as SavedMaterial | undefined;
  if (!saved) return;
  const current = mesh.material;
  if (Array.isArray(current)) current.forEach((m) => m.dispose());
  else current.dispose();
  mesh.material = Array.isArray(saved)
    ? saved.map((x) => x.clone())
    : saved.clone();
}

export function applyMaterialPreset(
  root: THREE.Object3D,
  preset: MaterialPresetId,
  finish: FinishId = "polished",
): void {
  if (preset === "original") {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      applyShadowFlags(obj);
      restoreOriginal(obj);
    });
    return;
  }

  if (isGemPresetId(preset) && canApplySplitGemBand(root)) {
    applySplitGemBandSetup(root, (r) => applySplitGemBandPreset(r, preset));
    return;
  }

  // Models that come with role-tagged meshes (auto-segmented STL, hand-tagged
  // 3DM layers, the procedural jewelry assemblies) get partial application:
  // a metal preset only touches metal meshes, a gem preset only touches gem
  // meshes. Untagged meshes get the new material (legacy fallthrough).
  if (hasRoleTaggedMeshes(root)) {
    const wantsGem = isGemPresetId(preset);
    const target: JewelryRole | "any" = wantsGem ? "gem" : "metal";
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      applyShadowFlags(obj);
      const role = meshRole(obj);
      const applyHere =
        !role ||
        (target === "metal" && role === "metal") ||
        (target === "gem" && (role === "gem" || role === "accent-gem"));
      if (!applyHere) return;
      const template = wantsGem ? createGemMaterial(preset as Parameters<typeof createGemMaterial>[0]) : createPresetMaterial(preset, finish);
      assignMaterial(obj, template);
    });
    return;
  }

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    applyShadowFlags(obj);

    const template = createPresetMaterial(preset, finish);
    assignMaterial(obj, template);
  });
}

type SlotSelectionMap = Record<string, MaterialPresetId>;

function fallbackPresetForSlot(
  slot: SlotId,
  selections: SlotSelectionMap,
  fallbackPreset: MaterialPresetId,
): MaterialPresetId {
  const direct = selections[slot];
  if (direct) return direct;

  if (slot === "Heads") return selections["Metal 01"] ?? fallbackPreset;
  if (slot.startsWith("Metal")) return fallbackPreset;
  if (slot.startsWith("Gem") || slot.startsWith("Accent")) {
    return selections["Gem 01"] ?? "diamond";
  }
  return fallbackPreset;
}

function inferSlotRole(slot: SlotId): JewelryRole | "any" {
  if (slot === "Heads" || slot.startsWith("Metal")) return "metal";
  if (slot.startsWith("Gem") || slot.startsWith("Accent")) return "gem";
  return "any";
}

function buildTemplate(
  preset: MaterialPresetId,
  role: JewelryRole | "any",
  finish: FinishId,
): THREE.Material {
  if (preset !== "original" && isGemPresetId(preset)) {
    return createGemMaterial(preset as Parameters<typeof createGemMaterial>[0]);
  }
  if (preset !== "original") {
    return createPresetMaterial(preset, finish);
  }
  if (role === "gem") {
    return createGemMaterial("diamond");
  }
  return createPresetMaterial("gold-14k-yellow", finish);
}

export function applyMaterialPresetBySlot(
  root: THREE.Object3D,
  selections: SlotSelectionMap,
  fallbackPreset: MaterialPresetId,
  slotTokens?: PersistedSlotTokens,
  finish: FinishId = "polished",
): void {
  const slotMap = detectSlots(root, slotTokens);
  const realSlots = [...slotMap.keys()].filter((slot) => slot !== "default");
  if (realSlots.length === 0) {
    applyMaterialPreset(root, fallbackPreset, finish);
    return;
  }

  if (fallbackPreset === "original" && Object.keys(selections).length === 0) {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      applyShadowFlags(obj);
      restoreOriginal(obj);
    });
    return;
  }

  for (const [slot, meshes] of slotMap.entries()) {
    const resolvedPreset = fallbackPresetForSlot(slot, selections, fallbackPreset);
    const role = inferSlotRole(slot);
    for (const mesh of meshes) {
      applyShadowFlags(mesh);
      if (resolvedPreset === "original") {
        restoreOriginal(mesh);
        continue;
      }
      const template = buildTemplate(resolvedPreset, role, finish);
      assignMaterial(mesh, template);
    }
  }
}

function assignMaterial(mesh: THREE.Mesh, template: THREE.Material): void {
  if (Array.isArray(mesh.material)) {
    const len = mesh.material.length;
    mesh.material.forEach((m) => m.dispose());
    mesh.material = Array.from({ length: len }, () => template.clone());
  } else {
    mesh.material.dispose();
    mesh.material = template.clone();
  }
}

function applyShadowFlags(mesh: THREE.Mesh): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function applySplitGemBandSetup(
  root: THREE.Object3D,
  applyMaterials: (root: THREE.Object3D) => void,
): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) applyShadowFlags(obj);
  });
  applyMaterials(root);
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    const m = obj.material;
    if (Array.isArray(m)) m.forEach((mat) => mat.dispose());
    else m.dispose();
    const saved = obj.userData[ORIGINAL_KEY] as SavedMaterial | undefined;
    if (saved) {
      if (Array.isArray(saved)) saved.forEach((mat) => mat.dispose());
      else saved.dispose();
      delete obj.userData[ORIGINAL_KEY];
    }
  });
}
