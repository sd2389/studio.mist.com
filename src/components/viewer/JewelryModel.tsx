"use client";

import { Center, useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { STLLoader } from "three-stdlib";
import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";
import { GemGpuDiamondShimmer } from "@/components/DiamondGem";
import {
  applyMaterialPreset,
  applyMaterialPresetBySlot,
  disposeObject3D,
  snapshotOriginalMaterials,
} from "@/lib/apply-material-preset";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { classifyIslands, splitIslands } from "@/lib/mesh-segmentation";
import { modelExtFromUrl } from "@/lib/model-key";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { detectSlots } from "@/lib/slot-materials/detect-slots";
import { smoothStlGeometry } from "@/lib/stl-smoothing";
import { useMaterialPresetStore, type MaterialPresetId } from "@/stores/material-preset-store";

type JewelryModelProps = {
  url: string;
  preset: MaterialPresetId;
  modelConfig?: PersistedModelConfig;
};

/** Target longest-edge length (scene units) any model is normalised to. */
const FIT_SIZE = 1.4;
const RHINO3DM_LIBRARY_PATH = "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/";

export function JewelryModel({ url, preset, modelConfig }: JewelryModelProps) {
  const ext = modelExtFromUrl(url);
  if (ext === "stl") return <StlJewelryModel url={url} preset={preset} modelConfig={modelConfig} />;
  if (ext === "3dm") return <Rhino3dmJewelryModel url={url} preset={preset} modelConfig={modelConfig} />;
  return <GltfJewelryModel url={url} preset={preset} modelConfig={modelConfig} />;
}

function GltfJewelryModel({ url, preset, modelConfig }: JewelryModelProps) {
  const { scene } = useGLTF(url);
  return <PresetWrapper raw={scene} preset={preset} modelConfig={modelConfig} />;
}

/**
 * Heuristic role tagging from Rhino layer names. Rhino jewelry templates use
 * standard layer names ("Gem", "Gem 01", "Metal 01", "Diamond_Round" object
 * names, etc.). Anything matching gem/diamond/stone → "gem"; metal/gold/silver
 * /platinum → "metal". Unknown layers are left untagged (they'll get the
 * fallback metal material but skip the role-aware split).
 */
function classifyRhinoLayer(name: string): "gem" | "metal" | null {
  const n = name.toLowerCase();
  if (/(gem|diamond|stone|jewel|pavé|pave)/.test(n)) return "gem";
  if (/(metal|gold|silver|platinum|band|shank|prong|head|setting|bezel)/.test(n)) return "metal";
  return null;
}

type RhinoLayerInfo = { name?: string; color?: { r: number; g: number; b: number; a: number } };

function Rhino3dmJewelryModel({ url, preset, modelConfig }: JewelryModelProps) {
  const loaded = useLoader(Rhino3dmLoader, url, (loader) => {
    (loader as Rhino3dmLoader).setLibraryPath(RHINO3DM_LIBRARY_PATH);
  });
  const root = useMemo(() => {
    const cloned = loaded.clone(true);
    // The Rhino3dmLoader stamps the loaded layer table on the root's userData.
    const layers: RhinoLayerInfo[] = (cloned.userData.layers as RhinoLayerInfo[] | undefined) ?? [];

    const counts = { metal: 0, gem: 0, untagged: 0 };
    const metalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd4d4d8,
      metalness: 1,
      roughness: 0.18,
      clearcoat: 0.6,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.5,
    });
    const gemMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.04,
      transmission: 0.95,
      thickness: 0.4,
      ior: 2.0,
      envMapIntensity: 1.5,
      transparent: true,
    });

    cloned.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.geometry) return;
      o.geometry.computeVertexNormals();
      o.castShadow = true;
      o.receiveShadow = true;

      const attrs = (o.userData?.attributes ?? {}) as { layerIndex?: number; name?: string };
      const layerIdx = typeof attrs.layerIndex === "number" ? attrs.layerIndex : -1;
      const layerName = (layers[layerIdx]?.name ?? "").toString();
      const role = classifyRhinoLayer(layerName) ?? classifyRhinoLayer(attrs.name ?? "") ?? null;

      if (role) {
        o.userData.jewelryRole = role;
        o.material = role === "gem" ? gemMaterial.clone() : metalMaterial.clone();
        counts[role] += 1;
      } else {
        o.material = metalMaterial.clone();
        counts.untagged += 1;
      }
    });

    if (typeof window !== "undefined") {
      console.info(
        `[rhino3dm] layers=${layers.length} meshes tagged metal=${counts.metal} gem=${counts.gem} untagged=${counts.untagged}`,
      );
    }
    return cloned;
  }, [loaded]);
  return <PresetWrapper raw={root} preset={preset} modelConfig={modelConfig} />;
}

function StlJewelryModel({ url, preset, modelConfig }: JewelryModelProps) {
  const geometry = useLoader(STLLoader, url) as THREE.BufferGeometry;
  const root = useMemo(() => buildStlRoot(geometry), [geometry]);
  return <PresetWrapper raw={root} preset={preset} modelConfig={modelConfig} />;
}

function buildStlRoot(geometry: THREE.BufferGeometry): THREE.Object3D {
  const metalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd4d4d8,
    metalness: 1,
    roughness: 0.18,
    clearcoat: 0.6,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.5,
  });
  const gemMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.05,
    transmission: 0.9,
    thickness: 0.4,
    ior: 2.0,
    envMapIntensity: 1.4,
    transparent: true,
  });

  const group = new THREE.Group();

  // Always merge + smooth first. Segmentation is best-effort: try it, but
  // if it throws (OOM, invalid topology, …) fall back to a single mesh so
  // the user still gets to see something.
  const smoothed = smoothStlGeometry(geometry, 1e-4, "smooth");

  let islands: THREE.BufferGeometry[];
  let roles: ("metal" | "gem")[];
  try {
    islands = splitIslands(smoothed);
    roles = classifyIslands(islands);
  } catch (err) {
    console.warn("[stl-segmentation] failed, falling back to single mesh:", err);
    islands = [smoothed];
    roles = ["metal"];
  }

  // Single-island result → no segmentation possible (CAD did boolean union).
  // Skip the split machinery entirely so applyMaterialPreset doesn't enter
  // role-aware mode for a model that doesn't actually have roles.
  if (islands.length === 1) {
    const mesh = new THREE.Mesh(islands[0], metalMaterial);
    mesh.name = "stl-mesh";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  islands.forEach((g, i) => {
    const role = roles[i];
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, role === "gem" ? gemMaterial.clone() : metalMaterial.clone());
    mesh.name = `stl-island-${i}-${role}`;
    mesh.userData.jewelryRole = role;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return group;
}

function PresetWrapper({
  raw,
  preset,
  modelConfig,
}: {
  raw: THREE.Object3D;
  preset: MaterialPresetId;
  modelConfig?: PersistedModelConfig;
}) {
  const finish = useMaterialPresetStore((s) => s.finish);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const model = useMemo(() => {
    const cloned = raw.clone(true);
    fitToUnit(cloned, FIT_SIZE);
    snapshotOriginalMaterials(cloned);
    return cloned;
  }, [raw]);
  const slotTokens = modelConfig?.slotTokens;
  const slotMap = useMemo(() => detectSlots(model, slotTokens), [model, slotTokens]);
  const hasSlotAwareModel = useMemo(() => {
    return [...slotMap.keys()].some((slot) => slot !== "default");
  }, [slotMap]);

  useEffect(() => {
    return () => disposeObject3D(model);
  }, [model]);

  useLayoutEffect(() => {
    if (hasSlotAwareModel) {
      applyMaterialPresetBySlot(model, slotSelections, preset, slotTokens, finish);
      return;
    }
    applyMaterialPreset(model, preset, finish);
  }, [model, preset, finish, slotSelections, hasSlotAwareModel, slotTokens]);

  return (
    <Center>
      <GemGpuDiamondShimmer object={model} active={isGemPresetId(preset)} />
      <primitive object={model} />
    </Center>
  );
}

/** Scale an Object3D so its longest AABB edge equals `targetSize`. No-op when the box is degenerate. */
function fitToUnit(obj: THREE.Object3D, targetSize: number): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxEdge = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxEdge) || maxEdge <= 1e-6) return;
  const factor = targetSize / maxEdge;
  obj.scale.multiplyScalar(factor);
}
