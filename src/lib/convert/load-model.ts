import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";
import { STLLoader } from "three-stdlib";
import { classifyIslands, splitIslands } from "@/lib/mesh-segmentation";
import { ensureRhinoLoaderPatched } from "@/lib/rhino-loader-patch";
import {
  inferSlotFromCandidates,
  type PersistedSlotTokens,
} from "@/lib/slot-materials/detect-slots";
import { smoothStlGeometry } from "@/lib/stl-smoothing";
import type { LoadedModel } from "./types";

const RHINO3DM_LIBRARY_PATH = "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/";

function extOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

function glbFilenameFrom(file: File): string {
  const stem = file.name.replace(/\.[^.]+$/, "") || "model";
  return `${stem}.glb`;
}

function classifyRhinoLayer(name: string): "gem" | "metal" | null {
  const n = name.toLowerCase();
  if (/(gem|diamond|stone|jewel|pavé|pave)/.test(n)) return "gem";
  if (/(metal|gold|silver|platinum|band|shank|prong|head|setting|bezel)/.test(n)) return "metal";
  return null;
}

type RhinoLayerInfo = { name?: string };

function buildSlotTokensFromNames(names: string[]): PersistedSlotTokens {
  const tokens: PersistedSlotTokens = {};
  for (const name of names) {
    const slot = inferSlotFromCandidates([name]);
    if (slot === "default") continue;
    const key = slot;
    const list = tokens[key] ?? [];
    const token = name.trim().toLowerCase();
    if (token && !list.includes(token)) list.push(token);
    tokens[key] = list;
  }
  return tokens;
}

function collectNamesFromObject(root: THREE.Object3D): string[] {
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
  return Array.from(names);
}

async function loadGlbOrGltf(file: File): Promise<LoadedModel> {
  const loader = new GLTFLoader();
  const blobUrl = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(blobUrl);
    const names = collectNamesFromObject(gltf.scene);
    return { root: gltf.scene, slotTokens: buildSlotTokensFromNames(names) };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function loadRhino3dm(file: File): Promise<LoadedModel> {
  ensureRhinoLoaderPatched();
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath(RHINO3DM_LIBRARY_PATH);
  const blobUrl = URL.createObjectURL(file);
  try {
    const loadPromise = loader.loadAsync(blobUrl);
    const root = await Promise.race([
      loadPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Rhino parse timed out (120s)")), 120_000),
      ),
    ]);
    const layers: RhinoLayerInfo[] =
      (root.userData.layers as RhinoLayerInfo[] | undefined) ?? [];
    const layerNames = layers.map((layer) => layer.name ?? "").filter(Boolean);

    const metalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd9d4ca,
      metalness: 1,
      roughness: 0.13,
    });
    const gemMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.015,
      transmission: 0.98,
      thickness: 0.62,
      ior: 2.35,
      transparent: true,
    });

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
      obj.geometry.computeVertexNormals();
      const attrs = (obj.userData?.attributes ?? {}) as {
        layerIndex?: number;
        name?: string;
      };
      const layerIdx = typeof attrs.layerIndex === "number" ? attrs.layerIndex : -1;
      const layerName = (layers[layerIdx]?.name ?? "").toString();
      const role =
        classifyRhinoLayer(layerName) ?? classifyRhinoLayer(attrs.name ?? "") ?? "metal";
      obj.userData.jewelryRole = role;
      obj.material = role === "gem" ? gemMaterial.clone() : metalMaterial.clone();
      if (layerName) obj.name = layerName;
      else if (attrs.name) obj.name = attrs.name;
    });

    const objectNames = collectNamesFromObject(root);
    const slotTokens = buildSlotTokensFromNames([...layerNames, ...objectNames]);
    return { root, slotTokens };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function buildStlRoot(geometry: THREE.BufferGeometry): THREE.Object3D {
  const metalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd4d4d8,
    metalness: 1,
    roughness: 0.18,
  });
  const gemMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.05,
    transmission: 0.9,
    thickness: 0.4,
    ior: 2.0,
    transparent: true,
  });

  const group = new THREE.Group();
  const smoothed = smoothStlGeometry(geometry, 1e-4, "smooth");

  let islands: THREE.BufferGeometry[];
  let roles: ("metal" | "gem")[];
  try {
    islands = splitIslands(smoothed);
    roles = classifyIslands(islands);
  } catch {
    islands = [smoothed];
    roles = ["metal"];
  }

  if (islands.length === 1) {
    const mesh = new THREE.Mesh(islands[0], metalMaterial);
    mesh.name = "Metal 01";
    group.add(mesh);
    return group;
  }

  islands.forEach((geom, index) => {
    const role = roles[index];
    geom.computeVertexNormals();
    const slotName = role === "gem" ? `Gem ${index + 1}` : `Metal ${index + 1}`;
    const mesh = new THREE.Mesh(
      geom,
      role === "gem" ? gemMaterial.clone() : metalMaterial.clone(),
    );
    mesh.name = slotName;
    mesh.userData.jewelryRole = role;
    group.add(mesh);
  });

  return group;
}

async function loadStl(file: File): Promise<LoadedModel> {
  const arrayBuffer = await file.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(arrayBuffer);
  const root = buildStlRoot(geometry);
  const slotTokens = buildSlotTokensFromNames(collectNamesFromObject(root));
  return { root, slotTokens };
}

export async function loadModelFromFile(file: File): Promise<LoadedModel> {
  const ext = extOf(file.name);
  if (ext === "glb" || ext === "gltf") return loadGlbOrGltf(file);
  if (ext === "3dm") return loadRhino3dm(file);
  if (ext === "stl") return loadStl(file);
  throw new Error(`Unsupported model format: .${ext || "unknown"}`);
}

export { glbFilenameFrom };
