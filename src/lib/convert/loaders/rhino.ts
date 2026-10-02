import * as THREE from "three";
import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";
import { ensureRhinoLoaderPatched } from "@/lib/rhino-loader-patch";
import { mmPerRhinoUnit } from "../model-units";
import { toFacetedGemGeometry } from "../segmentation/normals";
import type { FormatLoader } from "../types";

const RHINO3DM_LIBRARY_PATH = "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/";
const PARSE_TIMEOUT_MS = 120_000;

type RhinoLayerInfo = { name?: string };
type RhinoAttributes = { layerIndex?: number; name?: string };

export function classifyRhinoLayer(name: string): "gem" | "metal" | null {
  const n = name.toLowerCase();
  if (/(gem|diamond|stone|jewel|pavé|pave)/.test(n)) return "gem";
  if (/(metal|gold|silver|platinum|band|shank|prong|head|setting|bezel)/.test(n)) return "metal";
  return null;
}

function createRhinoMetalMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: 0xd9d4ca, metalness: 1, roughness: 0.13 });
}

function createRhinoGemMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.015,
    transmission: 0.98,
    thickness: 0.62,
    ior: 2.35,
    transparent: true,
  });
}

/** Block instances carry their own attributes; plain objects carry theirs on the mesh. */
function attributesOf(mesh: THREE.Mesh): RhinoAttributes {
  for (let parent = mesh.parent; parent; parent = parent.parent) {
    if (parent.userData.rhinoInstanceAttributes) return parent.userData.rhinoInstanceAttributes as RhinoAttributes;
  }
  return (mesh.userData?.attributes ?? {}) as RhinoAttributes;
}

function labelRhinoMesh(mesh: THREE.Mesh, layers: RhinoLayerInfo[]): void {
  const attrs = attributesOf(mesh);
  const layerIndex = typeof attrs.layerIndex === "number" ? attrs.layerIndex : -1;
  const layerName = (layers[layerIndex]?.name ?? "").toString();
  const role = classifyRhinoLayer(layerName) ?? classifyRhinoLayer(attrs.name ?? "") ?? "metal";
  mesh.userData.jewelryRole = role;
  if (role === "gem") {
    const faceted = toFacetedGemGeometry(mesh.geometry);
    mesh.geometry.dispose();
    mesh.geometry = faceted;
    mesh.material = createRhinoGemMaterial();
  } else {
    mesh.geometry.computeVertexNormals();
    mesh.material = createRhinoMetalMaterial();
  }
  if (layerName) mesh.name = layerName;
  else if (attrs.name) mesh.name = attrs.name;
}

async function parseWithTimeout(loader: Rhino3dmLoader, url: string): Promise<THREE.Object3D> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Rhino parse timed out (120s)")), PARSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([loader.loadAsync(url), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Rhino layers name the slots; the model's unit system is declared in its settings. */
export const loadRhino: FormatLoader = async (file, { onStatus }) => {
  ensureRhinoLoaderPatched();
  onStatus({ message: "Reading Rhino model…" });
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath(RHINO3DM_LIBRARY_PATH);
  const blobUrl = URL.createObjectURL(file);
  try {
    const root = await parseWithTimeout(loader, blobUrl);
    const layers = (root.userData.layers as RhinoLayerInfo[] | undefined) ?? [];
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry) labelRhinoMesh(object, layers);
    });
    const settings = root.userData.settings as { modelUnitSystem?: unknown } | undefined;
    return {
      root,
      declaredMmPerUnit: mmPerRhinoUnit(settings?.modelUnitSystem),
      slotSource: "names",
      extraSlotNames: layers.map((layer) => layer.name ?? "").filter(Boolean),
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
    loader.dispose();
  }
};
