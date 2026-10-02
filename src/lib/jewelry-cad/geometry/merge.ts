import * as THREE from "three";

/**
 * Merging for slot meshes. Metal parts stay indexed (smooth shading, shared vertices);
 * stones stay non-indexed (flat facets). Parts are concatenated, never welded, so every
 * part remains its own closed island.
 */

function attributeNames(geometries: THREE.BufferGeometry[]): string[] {
  const first = geometries[0];
  if (!first) return [];
  return Object.keys(first.attributes).filter((name) => geometries.every((g) => g.getAttribute(name)));
}

/** Concatenate geometries (indexed or not) into one indexed geometry. */
export function mergeIndexed(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = attributeNames(geometries);
  const merged = new THREE.BufferGeometry();
  let vertexTotal = 0;
  let indexTotal = 0;
  for (const g of geometries) {
    vertexTotal += g.getAttribute("position").count;
    indexTotal += g.getIndex()?.count ?? g.getAttribute("position").count;
  }
  for (const name of names) {
    const itemSize = geometries[0]!.getAttribute(name).itemSize;
    const out = new Float32Array(vertexTotal * itemSize);
    let offset = 0;
    for (const g of geometries) {
      const attr = g.getAttribute(name);
      for (let i = 0; i < attr.count; i++) {
        for (let k = 0; k < itemSize; k++) out[(offset + i) * itemSize + k] = attr.getComponent(i, k);
      }
      offset += attr.count;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(out, itemSize));
  }
  const index = vertexTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
  let vOffset = 0;
  let iOffset = 0;
  for (const g of geometries) {
    const count = g.getAttribute("position").count;
    const gi = g.getIndex();
    const n = gi?.count ?? count;
    for (let i = 0; i < n; i++) index[iOffset + i] = (gi ? gi.getX(i) : i) + vOffset;
    vOffset += count;
    iOffset += n;
  }
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}

/** Concatenate non-indexed triangle soups (stones), keeping each facet's own normals. */
export function mergeNonIndexed(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const soups = geometries.map((g) => (g.getIndex() ? g.toNonIndexed() : g));
  const total = soups.reduce((n, g) => n + g.getAttribute("position").count, 0);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let offset = 0;
  for (const g of soups) {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    positions.set(p.array as Float32Array, offset * 3);
    if (n) normals.set(n.array as Float32Array, offset * 3);
    offset += p.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return merged;
}

/** Copy of `geometry` with `matrix` baked in (normals follow). */
export function transformed(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = geometry.clone();
  g.applyMatrix4(matrix);
  return g;
}
