import * as THREE from "three";
import type { FormatLoader, FormatLoaderContext, ParsedModel } from "../types";
import { getOcctWorker, type OcctFormat, type OcctMesh, type OcctNode, type OcctParams } from "./occt-worker";

/**
 * STEP / IGES through OpenCascade. Tolerances are relative to the model's average bounding-box
 * size, so a 20 mm ring is meshed to a ~6 µm chord error and ~7° per segment — prongs and bead
 * rows stay round in reflections. Output units are millimetres whatever the file declares.
 */
export const OCCT_TESSELLATION: OcctParams = {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.0004,
  angularDeflection: 0.12,
};

const FORMAT_LABEL: Record<OcctFormat, string> = { step: "STEP", iges: "IGES" };

function buildMesh(data: OcctMesh): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.attributes.position.array, 3));
  if (data.attributes.normal) geometry.setAttribute("normal", new THREE.BufferAttribute(data.attributes.normal.array, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.index.array, 1));
  const color = data.color ? new THREE.Color(...data.color) : new THREE.Color(0xcccccc);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
  mesh.name = data.name ?? "";
  return mesh;
}

/** Mirror the STEP assembly tree; product names become node and mesh names (slot hints). */
function buildNode(node: OcctNode, meshes: OcctMesh[]): THREE.Object3D {
  const group = new THREE.Group();
  group.name = node.name ?? "";
  for (const meshIndex of node.meshes ?? []) {
    const data = meshes[meshIndex];
    if (data) group.add(buildMesh(data));
  }
  for (const child of node.children ?? []) group.add(buildNode(child, meshes));
  return group;
}

async function loadOcct(format: OcctFormat, file: File, { onStatus }: FormatLoaderContext): Promise<ParsedModel> {
  const label = FORMAT_LABEL[format];
  onStatus({ message: "Converting CAD… loading the CAD kernel", progress: 0 });
  const worker = await getOcctWorker((fraction) =>
    onStatus({ message: "Converting CAD… downloading the CAD kernel (first time only)", progress: fraction }));
  onStatus({ message: `Converting CAD… tessellating ${label} surfaces` });
  const result = await worker.read(format, await file.arrayBuffer(), OCCT_TESSELLATION);
  const meshes = result.meshes ?? [];
  if (!result.success || meshes.length === 0) {
    throw new Error(`Could not read this ${label} file — it contains no solids or surfaces.`);
  }
  onStatus({ message: "Converting CAD… detecting metal and stones" });
  const root = result.root ? buildNode(result.root, meshes) : new THREE.Group().add(...meshes.map(buildMesh));
  return { root, declaredMmPerUnit: 1, slotSource: "shape" };
}

export const loadStep: FormatLoader = (file, context) => loadOcct("step", file, context);
export const loadIges: FormatLoader = (file, context) => loadOcct("iges", file, context);
