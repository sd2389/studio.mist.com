/**
 * Position-only vertex welding. STL writes three unshared corners per triangle and B-rep
 * tessellators (STEP/IGES) split vertices along every face edge, so which triangles touch
 * has to be rebuilt from positions alone before islands can be found.
 *
 * Uses an open-addressing hash over quantised coordinates: string-keyed maps are ~10× slower
 * on the multi-million-corner meshes jewelry CAD exports.
 */

export type WeldResult = {
  /** Weld id of every source vertex. */
  weldIdOfVertex: Uint32Array;
  /** One representative position (x, y, z) per weld id. */
  positions: Float32Array;
  weldCount: number;
};

const EMPTY = -1;

function nextPowerOfTwo(value: number): number {
  let size = 16;
  while (size < value) size *= 2;
  return size;
}

function cellHash(x: number, y: number, z: number): number {
  return Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
}

class CellTable {
  private cells: Int32Array;
  private ids: Int32Array;
  private mask: number;
  size = 0;

  constructor(capacity: number) {
    const slots = nextPowerOfTwo(capacity);
    this.cells = new Int32Array(slots * 3);
    this.ids = new Int32Array(slots).fill(EMPTY);
    this.mask = slots - 1;
  }

  /** Id already stored for the cell, or `fresh` after inserting it. */
  findOrInsert(x: number, y: number, z: number, fresh: number): number {
    if ((this.size + 1) * 2 > this.ids.length) this.grow();
    let slot = cellHash(x, y, z) & this.mask;
    while (this.ids[slot] !== EMPTY) {
      const base = slot * 3;
      if (this.cells[base] === x && this.cells[base + 1] === y && this.cells[base + 2] === z) {
        return this.ids[slot];
      }
      slot = (slot + 1) & this.mask;
    }
    this.store(slot, x, y, z, fresh);
    return fresh;
  }

  private store(slot: number, x: number, y: number, z: number, id: number): void {
    this.cells[slot * 3] = x;
    this.cells[slot * 3 + 1] = y;
    this.cells[slot * 3 + 2] = z;
    this.ids[slot] = id;
    this.size += 1;
  }

  private grow(): void {
    const { cells, ids } = this;
    this.cells = new Int32Array(cells.length * 2);
    this.ids = new Int32Array(ids.length * 2).fill(EMPTY);
    this.mask = this.ids.length - 1;
    this.size = 0;
    for (let slot = 0; slot < ids.length; slot++) {
      const id = ids[slot];
      if (id === EMPTY) continue;
      const x = cells[slot * 3], y = cells[slot * 3 + 1], z = cells[slot * 3 + 2];
      let target = cellHash(x, y, z) & this.mask;
      while (this.ids[target] !== EMPTY) target = (target + 1) & this.mask;
      this.store(target, x, y, z, id);
    }
  }
}

/** Collapse vertices closer than `tolerance` (grid-quantised) into shared weld ids. */
export function weldPositions(
  position: ArrayLike<number>,
  vertexCount: number,
  tolerance: number,
): WeldResult {
  const inv = 1 / Math.max(tolerance, 1e-12);
  const weldIdOfVertex = new Uint32Array(vertexCount);
  const representatives = new Float32Array(vertexCount * 3);
  // Soup meshes share each corner ~6 ways; start small and let the table grow.
  const table = new CellTable(Math.max(16, vertexCount >> 2));
  let weldCount = 0;

  for (let v = 0; v < vertexCount; v++) {
    const x = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2];
    // `| 0` keeps far-from-origin cells comparable with the Int32 table after wrapping.
    const id = table.findOrInsert(
      Math.round(x * inv) | 0,
      Math.round(y * inv) | 0,
      Math.round(z * inv) | 0,
      weldCount,
    );
    if (id === weldCount) {
      representatives[id * 3] = x;
      representatives[id * 3 + 1] = y;
      representatives[id * 3 + 2] = z;
      weldCount += 1;
    }
    weldIdOfVertex[v] = id;
  }

  return { weldIdOfVertex, positions: representatives.slice(0, weldCount * 3), weldCount };
}

/** Default weld tolerance: far below any real feature, above float32 export noise. */
export function weldToleranceFor(extent: number): number {
  return Math.max(extent, 1e-9) * 1e-6;
}
