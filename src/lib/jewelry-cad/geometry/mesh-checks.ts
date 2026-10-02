import * as THREE from "three";

/**
 * Mesh validity checks used by the tests and by the exporters' sanity passes.
 * Positions are compared after quantising, so seam duplicates count as one vertex.
 */

const QUANT = 1e5; // 0.01 µm in mm

function positionKey(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): string {
  return `${Math.round(pos.getX(i) * QUANT)},${Math.round(pos.getY(i) * QUANT)},${Math.round(pos.getZ(i) * QUANT)}`;
}

function cornerIndex(geometry: THREE.BufferGeometry, corner: number): number {
  const index = geometry.getIndex();
  return index ? index.getX(corner) : corner;
}

function cornerCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  return index ? index.count : geometry.getAttribute("position").count;
}

export type EdgeReport = {
  triangles: number;
  /** Edges used by exactly one triangle (holes). */
  openEdges: number;
  /** Edges used by more than two triangles. */
  nonManifoldEdges: number;
  /** Manifold edges whose two triangles traverse them in the same direction (flipped winding). */
  inconsistentEdges: number;
  /** Triangles with zero area (collapsed corners). */
  degenerateTriangles: number;
};

/** Edge-manifold / closed-surface analysis on welded positions. */
export function analyzeEdges(geometry: THREE.BufferGeometry): EdgeReport {
  const pos = geometry.getAttribute("position");
  const corners = cornerCount(geometry);
  const directed = new Map<string, number>();
  let degenerateTriangles = 0;
  for (let c = 0; c < corners; c += 3) {
    const keys = [0, 1, 2].map((k) => positionKey(pos, cornerIndex(geometry, c + k)));
    if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) {
      degenerateTriangles++;
      continue;
    }
    for (let e = 0; e < 3; e++) {
      const key = `${keys[e]}>${keys[(e + 1) % 3]}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }
  let openEdges = 0, nonManifoldEdges = 0, inconsistentEdges = 0;
  const seen = new Set<string>();
  for (const [key, forward] of directed) {
    const [a, b] = key.split(">");
    const undirected = a! < b! ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(undirected)) continue;
    seen.add(undirected);
    const backward = directed.get(`${b}>${a}`) ?? 0;
    const total = forward + backward;
    if (total === 1) openEdges++;
    else if (total > 2) nonManifoldEdges++;
    else if (forward !== 1 || backward !== 1) inconsistentEdges++;
  }
  return { triangles: corners / 3, openEdges, nonManifoldEdges, inconsistentEdges, degenerateTriangles };
}

/** Closed, edge-manifold and consistently wound. */
export function isWatertight(geometry: THREE.BufferGeometry): boolean {
  const r = analyzeEdges(geometry);
  return r.openEdges === 0 && r.nonManifoldEdges === 0 && r.inconsistentEdges === 0;
}

/** Signed volume (positive for outward winding) in the geometry's units cubed. */
export function signedVolume(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position");
  const corners = cornerCount(geometry);
  let v = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < corners; i += 3) {
    a.fromBufferAttribute(pos, cornerIndex(geometry, i));
    b.fromBufferAttribute(pos, cornerIndex(geometry, i + 1));
    c.fromBufferAttribute(pos, cornerIndex(geometry, i + 2));
    v += a.dot(b.cross(c));
  }
  return v / 6;
}

/** Split a geometry into connected islands (triangles sharing a welded corner). */
export function splitIslands(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const pos = geometry.getAttribute("position");
  const corners = cornerCount(geometry);
  const idOfKey = new Map<string, number>();
  const cornerIds = new Int32Array(corners);
  for (let c = 0; c < corners; c++) {
    const key = positionKey(pos, cornerIndex(geometry, c));
    let id = idOfKey.get(key);
    if (id === undefined) {
      id = idOfKey.size;
      idOfKey.set(key, id);
    }
    cornerIds[c] = id;
  }
  const parent = Array.from({ length: idOfKey.size }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let c = 0; c < corners; c += 3) {
    const r0 = find(cornerIds[c]!);
    parent[find(cornerIds[c + 1]!)] = r0;
    parent[find(cornerIds[c + 2]!)] = r0;
  }
  const buckets = new Map<number, number[]>();
  for (let c = 0; c < corners; c += 3) {
    const root = find(cornerIds[c]!);
    const list = buckets.get(root) ?? [];
    list.push(c);
    buckets.set(root, list);
  }
  return [...buckets.values()].map((tris) => {
    const out = new Float32Array(tris.length * 9);
    tris.forEach((c, t) => {
      for (let k = 0; k < 3; k++) {
        const i = cornerIndex(geometry, c + k);
        out.set([pos.getX(i), pos.getY(i), pos.getZ(i)], t * 9 + k * 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(out, 3));
    return g;
  });
}

/**
 * How far (in geometry units) the worst vertex sits in front of any triangle's plane.
 * 0 for a convex solid; a dent shows up as its depth.
 */
export function convexityError(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position");
  const corners = cornerCount(geometry);
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) verts.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  let worst = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < corners; t += 3) {
    a.fromBufferAttribute(pos, cornerIndex(geometry, t));
    b.fromBufferAttribute(pos, cornerIndex(geometry, t + 1));
    c.fromBufferAttribute(pos, cornerIndex(geometry, t + 2));
    n.subVectors(b, a).cross(c.clone().sub(a));
    const len = n.length();
    if (len < 1e-12) continue;
    n.divideScalar(len);
    const d = n.dot(a);
    for (const v of verts) worst = Math.max(worst, n.dot(v) - d);
  }
  return worst;
}
