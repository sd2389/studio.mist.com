import * as THREE from "three";
import { texture } from "three/tsl";
import { buildGemTraceTable, GEM_ATLAS_ROW_TEXELS } from "./gem-trace-geometry";

/**
 * One float texture holds the facet planes of every traced stone on the page: a row per
 * stone, texel 0 = (planeCount, radius, partnerRow, splitPlane), texels 1..n = (nx, ny, nz, d).
 * A stone traced as two convex pieces links each piece to its partner's row and names the
 * split plane between them (see `GemStonePlanes.partner`); other stones store -1 and 0.
 *
 * Geometry carries a `gemStoneRow` vertex attribute pointing at its stone's row, so gem
 * materials never need to know which mesh they are drawn on — one material can be shared
 * by any number of meshes, cloned freely, and rendered by several canvases at once.
 *
 * Rows are reference-counted per allocation: every geometry seen carrying them (the
 * original and any clones, which copy the attribute) holds a reference until disposed, and
 * the rows return to a free list when the last one goes. A generation stamp makes a
 * geometry whose rows were freed and reused re-register instead of reading another stone.
 */

export const GEM_STONE_ROW_ATTRIBUTE = "gemStoneRow";
const ROW_BASE_KEY = "gemTraceRowBase";
const ROW_GENERATION_KEY = "gemTraceRowGeneration";
const INITIAL_ROWS = 64;

type GemAtlas = {
  data: Float32Array;
  texture: THREE.DataTexture;
  capacityRows: number;
  usedRows: number;
};

type RowAllocation = { generation: number; rows: number; users: number };

function createAtlasTexture(data: Float32Array, rows: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, GEM_ATLAS_ROW_TEXELS, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Row 0 stays an empty stone: a mesh drawn before registration reads no planes, not someone else's. */
function createAtlas(rows: number): GemAtlas {
  const data = new Float32Array(GEM_ATLAS_ROW_TEXELS * rows * 4);
  return { data, texture: createAtlasTexture(data, rows), capacityRows: rows, usedRows: 1 };
}

let atlas: GemAtlas = createAtlas(INITIAL_ROWS);
let nextGeneration = 1;
const allocations = new Map<number, RowAllocation>();
const freeRanges: { start: number; count: number }[] = [];
const trackedGeometries = new WeakSet<THREE.BufferGeometry>();

/** Shared by every gem trace material; its value is swapped when the atlas grows. */
export const gemAtlasTextureNode = texture(atlas.texture);

function growAtlas(minRows: number): void {
  let rows = atlas.capacityRows;
  while (rows < minRows) rows *= 2;
  const next = createAtlas(rows);
  next.data.set(atlas.data);
  next.usedRows = atlas.usedRows;
  next.texture.needsUpdate = true;
  const previous = atlas.texture;
  atlas = next;
  gemAtlasTextureNode.value = next.texture;
  previous.dispose();
}

/** First fit from released rows, else append. */
function allocateRows(count: number): number {
  const index = freeRanges.findIndex((range) => range.count >= count);
  if (index >= 0) {
    const range = freeRanges[index]!;
    const start = range.start;
    range.start += count;
    range.count -= count;
    if (range.count === 0) freeRanges.splice(index, 1);
    return start;
  }
  const start = atlas.usedRows;
  if (start + count > atlas.capacityRows) growAtlas(start + count);
  atlas.usedRows += count;
  return start;
}

function releaseRows(start: number, count: number): void {
  // Zero the headers so anything still pointing here reads an empty stone.
  for (let row = start; row < start + count; row++) atlas.data[row * GEM_ATLAS_ROW_TEXELS * 4] = 0;
  atlas.texture.needsUpdate = true;
  freeRanges.push({ start, count });
}

/** Count `geometry` as a user of its rows until it is disposed. */
function trackUser(geometry: THREE.BufferGeometry, rowBase: number, allocation: RowAllocation): void {
  if (trackedGeometries.has(geometry)) return;
  trackedGeometries.add(geometry);
  allocation.users += 1;
  const onDispose = () => {
    geometry.removeEventListener("dispose", onDispose);
    allocation.users -= 1;
    if (allocation.users > 0 || allocations.get(rowBase) !== allocation) return;
    allocations.delete(rowBase);
    releaseRows(rowBase, allocation.rows);
  };
  geometry.addEventListener("dispose", onDispose);
}

function liveAllocation(geometry: THREE.BufferGeometry): { rowBase: number; allocation: RowAllocation } | null {
  const rowBase = geometry.userData[ROW_BASE_KEY];
  if (!geometry.getAttribute(GEM_STONE_ROW_ATTRIBUTE) || typeof rowBase !== "number") return null;
  const allocation = allocations.get(rowBase);
  if (!allocation || allocation.generation !== geometry.userData[ROW_GENERATION_KEY]) return null;
  return { rowBase, allocation };
}

/**
 * Register a gem geometry's stones in the atlas and tag its vertices with their rows.
 * Idempotent: a geometry already carrying live rows — including a `clone()` of one, which
 * copies both the attribute and the userData — is only counted as a user.
 */
export function registerGemTraceGeometry(geometry: THREE.BufferGeometry): void {
  const live = liveAllocation(geometry);
  if (live) {
    trackUser(geometry, live.rowBase, live.allocation);
    return;
  }

  const table = buildGemTraceTable(geometry);
  const rowBase = allocateRows(table.stones.length);
  table.stones.forEach((stone, i) => {
    const offset = (rowBase + i) * GEM_ATLAS_ROW_TEXELS * 4;
    atlas.data.fill(0, offset, offset + GEM_ATLAS_ROW_TEXELS * 4);
    // Header: plane count, radius, partner row (-1 = none) and split-plane index (0 = none).
    const partnerRow = stone.partner === undefined ? -1 : rowBase + stone.partner;
    atlas.data.set([stone.planeCount, stone.radius, partnerRow, stone.splitPlane ?? 0], offset);
    atlas.data.set(stone.planes, offset + 4);
  });
  atlas.texture.needsUpdate = true;

  const rows = new Float32Array(table.stoneOfVertex.length);
  for (let v = 0; v < rows.length; v++) rows[v] = rowBase + table.stoneOfVertex[v]!;
  geometry.setAttribute(GEM_STONE_ROW_ATTRIBUTE, new THREE.BufferAttribute(rows, 1));

  const allocation: RowAllocation = { generation: nextGeneration++, rows: table.stones.length, users: 0 };
  allocations.set(rowBase, allocation);
  geometry.userData[ROW_BASE_KEY] = rowBase;
  geometry.userData[ROW_GENERATION_KEY] = allocation.generation;
  trackUser(geometry, rowBase, allocation);
}

/** True when the geometry's rows are registered and still its own. */
export function hasGemTraceRows(geometry: THREE.BufferGeometry): boolean {
  return liveAllocation(geometry) !== null;
}

/** Rows currently allocated, for tests and diagnostics. */
export function gemTraceRowsInUse(): number {
  let rows = 0;
  for (const allocation of allocations.values()) rows += allocation.rows;
  return rows;
}
