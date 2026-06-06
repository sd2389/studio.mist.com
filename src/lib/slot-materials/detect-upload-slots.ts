"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";
import { ensureRhinoLoaderPatched } from "@/lib/rhino-loader-patch";
import { inferSlotFromCandidates, type SlotId } from "@/lib/slot-materials/detect-slots";

const RHINO3DM_LIBRARY_PATH = "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/";

function extOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

function collectSlotCandidates(values: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) out.add(trimmed);
  }
  return Array.from(out);
}

function collectSlotsFromCandidates(candidates: Iterable<string>): string[] {
  const slots = new Set<SlotId>();
  for (const candidate of candidates) {
    const slot = inferSlotFromCandidates([candidate]);
    if (slot !== "default") slots.add(slot);
  }
  return Array.from(slots);
}

async function detectFromGltfJson(file: File): Promise<string[]> {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as {
    nodes?: Array<{ name?: string }>;
    meshes?: Array<{ name?: string }>;
    materials?: Array<{ name?: string }>;
  };
  const names = collectSlotCandidates([
    ...(parsed.nodes?.map((node) => node.name ?? "") ?? []),
    ...(parsed.meshes?.map((mesh) => mesh.name ?? "") ?? []),
    ...(parsed.materials?.map((mat) => mat.name ?? "") ?? []),
  ]);
  return collectSlotsFromCandidates(names);
}

function slotsFromObject3d(root: THREE.Object3D): string[] {
  const names = new Set<string>();
  root.traverse((obj) => {
    if (obj.name) names.add(obj.name);
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material;
    if (Array.isArray(mat)) {
      for (const m of mat) if (m?.name) names.add(m.name);
      return;
    }
    if (mat?.name) names.add(mat.name);
  });
  return collectSlotsFromCandidates(names);
}

async function detectFromGlb(file: File): Promise<string[]> {
  const loader = new GLTFLoader();
  const blobUrl = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(blobUrl);
    return slotsFromObject3d(gltf.scene);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function detectFromRhino3dm(file: File): Promise<string[]> {
  ensureRhinoLoaderPatched();
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath(RHINO3DM_LIBRARY_PATH);
  const blobUrl = URL.createObjectURL(file);
  try {
    const root = await loader.loadAsync(blobUrl);
    const layerNames = ((root.userData.layers as Array<{ name?: string }> | undefined) ?? [])
      .map((layer) => layer.name ?? "")
      .filter(Boolean);
    const objectSlots = slotsFromObject3d(root);
    return Array.from(new Set([...collectSlotsFromCandidates(layerNames), ...objectSlots]));
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export async function detectSlotsFromUpload(file: File): Promise<string[]> {
  try {
    const ext = extOf(file.name);
    if (ext === "gltf") return await detectFromGltfJson(file);
    if (ext === "glb") return await detectFromGlb(file);
    if (ext === "3dm") return await detectFromRhino3dm(file);
    return [];
  } catch {
    return [];
  }
}
