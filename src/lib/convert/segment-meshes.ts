import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  assignIslandSlots,
  islandTriangleIds,
  measureGeometryIslands,
  readPositions,
  type GeometryIslands,
  type IslandMetrics,
  type JewelryRole,
} from "@/lib/mesh-segmentation";
import { createGemPreviewMaterial, createMetalPreviewMaterial } from "./jewelry-materials";
import { stoneNamedTriangles } from "./jewelry-names";
import { creasedNormalGeometry, hasSmoothNormals } from "./segmentation/normals";
import { weldToleranceFor } from "./segmentation/weld";

/**
 * Rebuilds a model's meshes as jewelry slots: every source mesh is baked into root space,
 * split into islands, classified, and the islands are regrouped into one mesh per slot
 * (`Metal 1`, `Gem 1`, `Accent 1`, …) tagged with `userData.jewelryRole`.
 */

type BakedPart = {
  /** Root-space positions (+ normals when the source had smooth ones); always indexed. */
  geometry: THREE.BufferGeometry;
  smoothNormals: boolean;
  /** Triangles whose mesh or material name says "stone" (see jewelry-names); null if none. */
  stoneNamed: Uint8Array | null;
  /** Null when the part is too heavy to segment: it then stays one metal island. */
  islands: GeometryIslands | null;
  remap?: Int32Array;
};

type IslandRef = { part: BakedPart; island: number };
const WHOLE_PART = -1;

function indexWithWinding(source: THREE.BufferGeometry, flip: boolean): THREE.BufferAttribute {
  const count = source.index ? source.index.count : source.getAttribute("position").count;
  const index = new Uint32Array(count - (count % 3));
  for (let c = 0; c < index.length; c++) index[c] = source.index ? source.index.getX(c) : c;
  // A mirrored transform turns the winding inside out; swap two corners to keep facets outward.
  if (flip) for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
  return new THREE.BufferAttribute(index, 1);
}

function bakePart(mesh: THREE.Mesh, rootInverse: THREE.Matrix4): BakedPart {
  const matrix = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
  const source = mesh.geometry;
  const smoothNormals = hasSmoothNormals(source);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(readPositions(source).slice(), 3));
  if (smoothNormals) geometry.setAttribute("normal", source.getAttribute("normal").clone());
  const index = indexWithWinding(source, matrix.determinant() < 0);
  geometry.setIndex(index);
  geometry.applyMatrix4(matrix);
  return { geometry, smoothNormals, stoneNamed: stoneNamedTriangles(mesh, index.count / 3), islands: null };
}

function wholePartMetrics(part: BakedPart): IslandMetrics {
  const size = part.geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3();
  return {
    triangleCount: (part.geometry.index?.count ?? 0) / 3, area: 0, volume: 0,
    boxVolume: size.x * size.y * size.z, isClosed: false, facetCount: 0, planarRatio: 0,
    inclinedShare: 0, sphericity: 0, isRod: false, convexity: null,
  };
}

/** An island is name-vouched when most of its triangles are. */
function isStoneNamed(ref: IslandRef): boolean {
  const flags = ref.part.stoneNamed;
  if (!flags) return false;
  const ids = triangleIdsOf(ref);
  let named = 0;
  for (let i = 0; i < ids.length; i++) named += flags[ids[i]];
  return named * 2 > ids.length;
}

function triangleIdsOf(ref: IslandRef): ArrayLike<number> {
  if (ref.island !== WHOLE_PART && ref.part.islands) return islandTriangleIds(ref.part.islands.groups, ref.island);
  const count = (ref.part.geometry.index?.count ?? 0) / 3;
  return new Uint32Array(count).map((_, i) => i);
}

/** Flat-shaded, non-indexed stones: one closed island per stone, merged per slot. */
function buildGemGeometry(refs: IslandRef[]): THREE.BufferGeometry {
  const idsList = refs.map(triangleIdsOf);
  const total = idsList.reduce((sum, ids) => sum + ids.length, 0);
  const positions = new Float32Array(total * 9);
  let cursor = 0;
  refs.forEach((ref, r) => {
    const index = ref.part.geometry.index!.array;
    const source = ref.part.geometry.getAttribute("position").array;
    const ids = idsList[r];
    for (let i = 0; i < ids.length; i++) {
      for (let k = 0; k < 3; k++) {
        const v = index[ids[i] * 3 + k];
        positions[cursor++] = source[v * 3];
        positions[cursor++] = source[v * 3 + 1];
        positions[cursor++] = source[v * 3 + 2];
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Compact the vertices an island uses (source vertex ids or weld ids) into a fresh index. */
function compactIsland(
  vertexOf: (corner: number) => number,
  ids: ArrayLike<number>,
  remap: Int32Array,
): { used: number[]; index: Uint32Array } {
  const used: number[] = [];
  const index = new Uint32Array(ids.length * 3);
  for (let i = 0; i < ids.length; i++) {
    for (let k = 0; k < 3; k++) {
      const v = vertexOf(ids[i] * 3 + k);
      if (remap[v] === -1) {
        remap[v] = used.length;
        used.push(v);
      }
      index[i * 3 + k] = remap[v];
    }
  }
  for (const v of used) remap[v] = -1;
  return { used, index };
}

function gatherAttribute(source: ArrayLike<number>, used: number[]): Float32Array {
  const out = new Float32Array(used.length * 3);
  used.forEach((v, i) => {
    out[i * 3] = source[v * 3];
    out[i * 3 + 1] = source[v * 3 + 1];
    out[i * 3 + 2] = source[v * 3 + 2];
  });
  return out;
}

function remapFor(part: BakedPart, size: number): Int32Array {
  if (!part.remap || part.remap.length < size) part.remap = new Int32Array(size).fill(-1);
  return part.remap;
}

/** Metal keeps authored smooth normals; soup-style meshes are welded and crease-smoothed. */
function buildMetalPartial(ref: IslandRef): THREE.BufferGeometry {
  const { part } = ref;
  const ids = triangleIdsOf(ref);
  if (part.smoothNormals || !part.islands) {
    const index = part.geometry.index!.array;
    const position = part.geometry.getAttribute("position");
    const { used, index: compact } = compactIsland((c) => index[c], ids, remapFor(part, position.count));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(gatherAttribute(position.array, used), 3));
    geometry.setIndex(new THREE.BufferAttribute(compact, 1));
    const normal = part.geometry.getAttribute("normal");
    if (normal) geometry.setAttribute("normal", new THREE.BufferAttribute(gatherAttribute(normal.array, used), 3));
    else geometry.computeVertexNormals();
    return geometry;
  }
  const { corners, weld } = part.islands.labels;
  const { used, index } = compactIsland((c) => corners[c], ids, remapFor(part, weld.weldCount));
  return creasedNormalGeometry({ positions: gatherAttribute(weld.positions, used), index });
}

function buildMetalGeometry(refs: IslandRef[]): THREE.BufferGeometry {
  const partials = refs.map(buildMetalPartial);
  if (partials.length === 1) return partials[0];
  const merged = mergeGeometries(partials) ?? partials[0];
  for (const partial of partials) if (partial !== merged) partial.dispose();
  return merged;
}

function slotMesh(slot: string, role: JewelryRole, refs: IslandRef[]): THREE.Mesh {
  const isGem = role !== "metal";
  const geometry = isGem ? buildGemGeometry(refs) : buildMetalGeometry(refs);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, isGem ? createGemPreviewMaterial() : createMetalPreviewMaterial());
  mesh.name = slot;
  mesh.userData.jewelryRole = role;
  return mesh;
}

function slotOrder(slot: string): number {
  const kind = slot.startsWith("Metal") ? 0 : slot.startsWith("Gem") ? 1 : 2;
  return kind * 1000 + Number(slot.replace(/\D+/g, "") || 0);
}

/** Classify every island of `meshes` (all under `root`) and regroup them into slot meshes. */
export function segmentMeshesIntoSlots(meshes: THREE.Mesh[], root: THREE.Object3D): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const parts = meshes.map((mesh) => bakePart(mesh, rootInverse));
  const bounds = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) bounds.union(part.geometry.boundingBox);
  }
  const size = bounds.getSize(new THREE.Vector3());
  const tolerance = weldToleranceFor(Math.max(size.x, size.y, size.z));

  const refs: IslandRef[] = [];
  const metrics: IslandMetrics[] = [];
  const vouched: boolean[] = [];
  for (const part of parts) {
    part.islands = measureGeometryIslands(part.geometry, tolerance);
    const count = part.islands?.labels.islandCount ?? 0;
    const islandRefs = part.islands ? Array.from({ length: count }, (_, island) => island) : [WHOLE_PART];
    for (const island of islandRefs) {
      const ref = { part, island };
      refs.push(ref);
      metrics.push(part.islands ? part.islands.metrics[island] : wholePartMetrics(part));
      vouched.push(isStoneNamed(ref));
    }
  }

  const bySlot = new Map<string, { role: JewelryRole; refs: IslandRef[] }>();
  assignIslandSlots(metrics, vouched).forEach(({ slot, role }, i) => {
    const entry = bySlot.get(slot) ?? { role, refs: [] };
    entry.refs.push(refs[i]);
    bySlot.set(slot, entry);
  });
  const slotMeshes = [...bySlot.entries()]
    .sort(([a], [b]) => slotOrder(a) - slotOrder(b))
    .map(([slot, { role, refs: slotRefs }]) => slotMesh(slot, role, slotRefs));
  for (const part of parts) part.geometry.dispose();
  return slotMeshes;
}
