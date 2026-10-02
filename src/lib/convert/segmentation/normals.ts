import * as THREE from "three";

/**
 * Normal treatment for segmented jewelry: stones are flat-shaded and non-indexed (the gem
 * shader needs true facet normals), metal gets smooth normals that stay sharp across creases
 * (band edges, prong tips) instead of the per-face normals STL and OBJ-without-`vn` carry.
 */

/** Edges bending more than this keep split normals; tessellated curves bend far less. */
export const METAL_CREASE_ANGLE = (40 * Math.PI) / 180;
const SAME_NORMAL_COS = 0.9999;
const MAX_NORMAL_SAMPLES = 20_000;

function isUnitLength(normal: THREE.Vector3): boolean {
  return Math.abs(normal.lengthSq() - 1) < 0.02;
}

/**
 * True when the geometry carries usable per-vertex (smooth) normals rather than per-face ones.
 * Many STL exporters write all-zero facet normals; any invalid normal disqualifies the set.
 */
export function hasSmoothNormals(geometry: THREE.BufferGeometry): boolean {
  const normal = geometry.getAttribute("normal");
  if (!normal) return false;
  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : normal.count) / 3);
  if (triangleCount === 0) return false;
  const step = Math.max(1, Math.floor(triangleCount / MAX_NORMAL_SAMPLES));
  let sampled = 0;
  let varying = 0;
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < triangleCount; t += step) {
    corners.forEach((corner, k) => corner.fromBufferAttribute(normal, index ? index.getX(t * 3 + k) : t * 3 + k));
    if (!corners.every(isUnitLength)) return false;
    const [a, b, c] = corners;
    sampled += 1;
    if (a.dot(b) < SAME_NORMAL_COS || a.dot(c) < SAME_NORMAL_COS) varying += 1;
  }
  return varying >= sampled * 0.02;
}

/** Non-indexed, position-only copy with one normal per facet. */
export function toFacetedGemGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const faceted = new THREE.BufferGeometry();
  faceted.setAttribute("position", source.getAttribute("position").clone());
  faceted.computeVertexNormals();
  faceted.computeBoundingBox();
  faceted.computeBoundingSphere();
  if (source !== geometry) source.dispose();
  return faceted;
}

type IndexedMesh = { positions: Float32Array; index: Uint32Array };

function faceNormals({ positions: p, index }: IndexedMesh): { weighted: Float32Array; unit: Float32Array } {
  const triangleCount = index.length / 3;
  const weighted = new Float32Array(triangleCount * 3);
  const unit = new Float32Array(triangleCount * 3);
  for (let t = 0; t < triangleCount; t++) {
    const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    weighted.set([nx, ny, nz], t * 3);
    unit.set([nx / length, ny / length, nz / length], t * 3);
  }
  return { weighted, unit };
}

/** Compressed vertex → incident-triangle lists. */
function incidentTriangles(index: Uint32Array, vertexCount: number): { offsets: Uint32Array; faces: Uint32Array } {
  const offsets = new Uint32Array(vertexCount + 1);
  for (let c = 0; c < index.length; c++) offsets[index[c] + 1] += 1;
  for (let v = 0; v < vertexCount; v++) offsets[v + 1] += offsets[v];
  const cursor = offsets.slice(0, vertexCount);
  const faces = new Uint32Array(index.length);
  for (let c = 0; c < index.length; c++) faces[cursor[index[c]]++] = Math.floor(c / 3);
  return { offsets, faces };
}

/** Output vertices created so far, chained per source vertex so creases can be matched. */
class SplitVertices {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  private readonly firstOut: Int32Array;
  private readonly nextOut: Int32Array;
  count = 0;

  constructor(vertexCount: number, maxOutputs: number) {
    this.positions = new Float32Array(maxOutputs * 3);
    this.normals = new Float32Array(maxOutputs * 3);
    this.firstOut = new Int32Array(vertexCount).fill(-1);
    this.nextOut = new Int32Array(maxOutputs);
  }

  /** Output id for source vertex `v` with normal `n`, reusing one whose normal matches. */
  resolve(v: number, n: THREE.Vector3, source: Float32Array): number {
    for (let out = this.firstOut[v]; out !== -1; out = this.nextOut[out]) {
      const dot = n.x * this.normals[out * 3] + n.y * this.normals[out * 3 + 1] + n.z * this.normals[out * 3 + 2];
      if (dot >= SAME_NORMAL_COS) return out;
    }
    const out = this.count++;
    this.nextOut[out] = this.firstOut[v];
    this.firstOut[v] = out;
    this.positions.set(source.subarray(v * 3, v * 3 + 3), out * 3);
    this.normals.set([n.x, n.y, n.z], out * 3);
    return out;
  }
}

/**
 * Area-weighted vertex normals that only average faces within `creaseAngle` of each other.
 * Vertices are split only where a crease needs two normals, so the result stays indexed.
 */
export function computeCreasedNormals(
  mesh: IndexedMesh,
  creaseAngle = METAL_CREASE_ANGLE,
): IndexedMesh & { normals: Float32Array } {
  const vertexCount = mesh.positions.length / 3;
  const creaseCos = Math.cos(creaseAngle);
  const { weighted, unit } = faceNormals(mesh);
  const { offsets, faces } = incidentTriangles(mesh.index, vertexCount);
  const split = new SplitVertices(vertexCount, mesh.index.length);
  const outIndex = new Uint32Array(mesh.index.length);
  const n = new THREE.Vector3();

  for (let c = 0; c < mesh.index.length; c++) {
    const v = mesh.index[c];
    const t = Math.floor(c / 3);
    n.set(0, 0, 0);
    for (let i = offsets[v]; i < offsets[v + 1]; i++) {
      const f = faces[i];
      const cos = unit[f * 3] * unit[t * 3] + unit[f * 3 + 1] * unit[t * 3 + 1] + unit[f * 3 + 2] * unit[t * 3 + 2];
      if (cos < creaseCos) continue;
      n.x += weighted[f * 3];
      n.y += weighted[f * 3 + 1];
      n.z += weighted[f * 3 + 2];
    }
    outIndex[c] = split.resolve(v, n.normalize(), mesh.positions);
  }
  return {
    positions: split.positions.slice(0, split.count * 3),
    normals: split.normals.slice(0, split.count * 3),
    index: outIndex,
  };
}

/** Indexed geometry with crease-aware smooth normals (source positions assumed welded). */
export function creasedNormalGeometry(mesh: IndexedMesh): THREE.BufferGeometry {
  const creased = computeCreasedNormals(mesh);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(creased.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(creased.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(creased.index, 1));
  return geometry;
}
