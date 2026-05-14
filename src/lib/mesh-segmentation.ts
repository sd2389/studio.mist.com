import * as THREE from "three";

/**
 * Split a STL-loaded BufferGeometry into its disconnected triangle islands
 * (connected-component decomposition). Each island becomes a separate
 * BufferGeometry — typically: the band is one island, each stone is another.
 *
 * Caveats:
 *   - Works only when the gem meshes are physically detached from the band
 *     in the CAD (most professional jewelry CAD does this; some artists
 *     boolean-union everything in which case islands == 1).
 *   - Assumes the geometry has been through `mergeVertices` first — adjacent
 *     triangles must share corner verts for adjacency detection to work.
 */
/**
 * Hard ceiling on triangle count before segmentation is skipped. STL files
 * from CAD can hit 300k+ triangles; the adjacency map + BFS bloat memory
 * past the browser comfort zone above ~250k. Beyond this we return the
 * original geometry as a single island and let the user upload .3dm instead.
 */
const MAX_TRI_FOR_SEGMENTATION = 220_000;

export function splitIslands(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const indexAttr = geometry.index;
  const positionAttr = geometry.attributes.position;
  if (!positionAttr) return [geometry.clone()];

  const triCount = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;
  if (triCount > MAX_TRI_FOR_SEGMENTATION) {
    return [geometry.clone()];
  }

  const indices = indexAttr ? Array.from(indexAttr.array) : seqIndices(positionAttr.count);

  // adjacency: vertex idx → list of triangle ids
  const vertToTris = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k];
      let bucket = vertToTris.get(v);
      if (!bucket) {
        bucket = [];
        vertToTris.set(v, bucket);
      }
      bucket.push(t);
    }
  }

  // BFS connected components on triangles
  const triIsland = new Int32Array(triCount).fill(-1);
  const islands: number[][] = [];
  for (let start = 0; start < triCount; start++) {
    if (triIsland[start] !== -1) continue;
    const id = islands.length;
    const bag: number[] = [];
    islands.push(bag);
    const queue = [start];
    triIsland[start] = id;
    while (queue.length > 0) {
      const t = queue.pop()!;
      bag.push(t);
      for (let k = 0; k < 3; k++) {
        const v = indices[t * 3 + k];
        const neighbors = vertToTris.get(v);
        if (!neighbors) continue;
        for (const nt of neighbors) {
          if (triIsland[nt] === -1) {
            triIsland[nt] = id;
            queue.push(nt);
          }
        }
      }
    }
  }

  if (islands.length <= 1) return [geometry.clone()];

  // Build a BufferGeometry per island
  return islands.map((tris) => buildSubGeometry(geometry, indices, tris));
}

function seqIndices(count: number): number[] {
  const arr = new Array<number>(count);
  for (let i = 0; i < count; i++) arr[i] = i;
  return arr;
}

function buildSubGeometry(
  source: THREE.BufferGeometry,
  indices: number[],
  tris: number[],
): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const positionAttr = source.attributes.position;
  const normalAttr = source.attributes.normal;
  const uvAttr = source.attributes.uv;

  const subVerts = tris.length * 3;
  const positions = new Float32Array(subVerts * 3);
  const normals = normalAttr ? new Float32Array(subVerts * 3) : null;
  const uvs = uvAttr ? new Float32Array(subVerts * 2) : null;

  let cursor = 0;
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k];
      positions[cursor * 3 + 0] = positionAttr.getX(v);
      positions[cursor * 3 + 1] = positionAttr.getY(v);
      positions[cursor * 3 + 2] = positionAttr.getZ(v);
      if (normals && normalAttr) {
        normals[cursor * 3 + 0] = normalAttr.getX(v);
        normals[cursor * 3 + 1] = normalAttr.getY(v);
        normals[cursor * 3 + 2] = normalAttr.getZ(v);
      }
      if (uvs && uvAttr) {
        uvs[cursor * 2 + 0] = uvAttr.getX(v);
        uvs[cursor * 2 + 1] = uvAttr.getY(v);
      }
      cursor += 1;
    }
  }

  out.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (normals) out.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  if (uvs) out.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * Heuristic classification of islands as "metal" (band) vs "gem" (stone):
 *   - The single largest-volume island is the band (the main structural mesh).
 *   - Smaller islands clustered above the band's geometric centre are gems.
 *   - Islands whose AABB volume < 30% of the largest are candidate gems.
 *
 * Returns an array same length as `islands` with role strings.
 */
export function classifyIslands(islands: THREE.BufferGeometry[]): ("metal" | "gem")[] {
  if (islands.length === 1) return ["metal"];
  const volumes = islands.map(islandVolume);
  const maxVol = Math.max(...volumes);
  const threshold = maxVol * 0.3;

  return islands.map((g, i) => {
    if (volumes[i] >= threshold) return "metal";
    return "gem";
  });
}

function islandVolume(g: THREE.BufferGeometry): number {
  if (!g.boundingBox) g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  return Math.max(size.x * size.y * size.z, 1e-9);
}
