import * as THREE from "three";
import { createPresetMaterial } from "@/lib/material-presets";
import {
  applySplitGemBandPreset,
  canApplySplitGemBand,
} from "@/lib/gem-gpu/apply-split-diamond";
import { createGemMaterial, isGemGpuMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { ensureFacetedGemNormalsOnMesh } from "@/lib/gem-gpu/ensure-faceted-gem-normals";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import {
  createGemMaterialFromParams,
  createMetalMaterialFromParams,
} from "@/lib/library/create-material-from-params";
import {
  isCatalogMaterialRef,
  parseCatalogMaterialSlug,
} from "@/lib/catalog/catalog-material-ref";
import {
  isCustomMaterialRef,
  parseCustomMaterialId,
  type SlotMaterialRef,
} from "@/lib/library/custom-material-ref";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { detectSlots, type PersistedSlotTokens, type SlotId } from "@/lib/slot-materials/detect-slots";
import { resolvePresetForSlot, sanitizeSlotSelections, type SlotSelectionMap } from "@/lib/slot-materials/material-rules";
import type { FinishId, MaterialPresetId } from "@/stores/material-preset-store";
import { useUserLibraryStore } from "@/stores/user-library-store";

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
  qualityReduce = false,
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
    applySplitGemBandSetup(root, (r) => applySplitGemBandPreset(r, preset, qualityReduce));
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
      const template = wantsGem
        ? createGemMaterial(preset as Parameters<typeof createGemMaterial>[0], { qualityReduce })
        : createPresetMaterial(preset, finish);
      assignMaterial(obj, template);
    });
    return;
  }

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    applyShadowFlags(obj);

    const template = isGemPresetId(preset)
      ? createGemMaterial(preset, { qualityReduce })
      : createPresetMaterial(preset, finish);
    assignMaterial(obj, template);
  });
}

type SlotSelectionMapLegacy = Record<string, MaterialPresetId>;

function buildCatalogTemplate(
  ref: SlotMaterialRef,
  role: JewelryRole | "any",
  finish: FinishId,
  qualityReduce = false,
): THREE.Material | null {
  if (!isCatalogMaterialRef(ref)) return null;
  const slug = parseCatalogMaterialSlug(ref);
  if (!slug) return null;
  const store = useCatalogParamsStore.getState();
  if (role === "gem" || role === "accent-gem") {
    const params = store.getGemParams(slug);
    if (params) return createGemMaterialFromParams(params, qualityReduce);
  } else {
    const params = store.getMetalParams(slug);
    if (params) return createMetalMaterialFromParams(params, finish);
  }
  return null;
}

function buildCustomTemplate(
  ref: SlotMaterialRef,
  qualityReduce = false,
): THREE.Material | null {
  if (!isCustomMaterialRef(ref)) return null;
  const id = parseCustomMaterialId(ref);
  if (id === null) return null;
  const item = useUserLibraryStore.getState().getMaterial(id);
  if (!item) return null;
  if (item.kind === "gem") return createGemMaterialFromParams(item.params, qualityReduce);
  const finish =
    typeof item.params.finish === "string" ? (item.params.finish as FinishId) : "polished";
  return createMetalMaterialFromParams(item.params, finish);
}

function buildTemplate(
  preset: SlotMaterialRef,
  role: JewelryRole | "any",
  finish: FinishId,
  qualityReduce = false,
): THREE.Material {
  const catalog = buildCatalogTemplate(preset, role, finish, qualityReduce);
  if (catalog) return catalog;

  const custom = buildCustomTemplate(preset, qualityReduce);
  if (custom) return custom;

  if (role === "metal" && isGemPresetId(preset as MaterialPresetId)) {
    return createPresetMaterial("gold-14k-yellow", finish);
  }
  if (role === "gem" && !isGemPresetId(preset as MaterialPresetId) && preset !== "original") {
    return createGemMaterial("diamond", { qualityReduce });
  }
  if (preset !== "original" && isGemPresetId(preset as MaterialPresetId)) {
    return createGemMaterial(preset as Parameters<typeof createGemMaterial>[0], { qualityReduce });
  }
  if (preset !== "original" && !isCustomMaterialRef(preset)) {
    return createPresetMaterial(preset as Exclude<MaterialPresetId, "original">, finish);
  }
  if (role === "gem") {
    return createGemMaterial("diamond", { qualityReduce });
  }
  return createPresetMaterial("gold-14k-yellow", finish);
}

function inferSlotRole(slot: SlotId): JewelryRole | "any" {
  if (slot === "Heads" || slot.startsWith("Metal")) return "metal";
  if (slot.startsWith("Gem") || slot.startsWith("Accent")) return "gem";
  return "any";
}

export function applyMaterialPresetBySlot(
  root: THREE.Object3D,
  selections: SlotSelectionMap | SlotSelectionMapLegacy,
  fallbackPreset: MaterialPresetId,
  slotTokens?: PersistedSlotTokens,
  finish: FinishId = "polished",
  qualityReduce = false,
): void {
  const sanitizedSelections = sanitizeSlotSelections(selections as SlotSelectionMap);
  const slotMap = detectSlots(root, slotTokens);
  const realSlots = [...slotMap.keys()].filter((slot) => slot !== "default");
  if (realSlots.length === 0) {
    applyMaterialPreset(root, fallbackPreset, finish, qualityReduce);
    return;
  }

  if (fallbackPreset === "original" && Object.keys(sanitizedSelections).length === 0) {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      applyShadowFlags(obj);
      restoreOriginal(obj);
    });
    return;
  }

  for (const [slot, meshes] of slotMap.entries()) {
    const resolvedPreset = resolvePresetForSlot(slot, sanitizedSelections, fallbackPreset, slotTokens);
    const role = inferSlotRole(slot);
    for (const mesh of meshes) {
      applyShadowFlags(mesh);
      if (resolvedPreset === "original") {
        restoreOriginal(mesh);
        continue;
      }
      const template = buildTemplate(resolvedPreset, role, finish, qualityReduce);
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
  if (isGemGpuMaterial(template)) {
    ensureFacetedGemNormalsOnMesh(mesh);
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
