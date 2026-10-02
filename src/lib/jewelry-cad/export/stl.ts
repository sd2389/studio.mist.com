import * as THREE from "three";
import type { BuiltPart } from "@/lib/jewelry-cad/types";

/**
 * Binary STL (80-byte header, uint32 triangle count, 50 bytes per triangle), millimetres.
 * Metal-only files are what a caster or printer wants; stones can be included for
 * visual prototypes.
 */

export type StlOptions = {
  includeStones?: boolean;
  /** Header text (ASCII, truncated to 80 bytes). Must not start with "solid". */
  header?: string;
};

export const STL_HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

function selectParts(parts: BuiltPart[], includeStones: boolean): BuiltPart[] {
  return parts.filter((p) => p.role === "metal" || includeStones);
}

function triangleCount(g: THREE.BufferGeometry): number {
  return (g.getIndex()?.count ?? g.getAttribute("position").count) / 3;
}

function writeHeader(view: DataView, text: string): void {
  const safe = text.replace(/^solid/i, "MIST").slice(0, STL_HEADER_BYTES);
  for (let i = 0; i < STL_HEADER_BYTES; i++) view.setUint8(i, i < safe.length ? safe.charCodeAt(i) & 0x7f : 0x20);
}

export function exportStl(parts: BuiltPart[], options: StlOptions = {}): Uint8Array {
  const chosen = selectParts(parts, options.includeStones ?? false);
  const total = chosen.reduce((n, p) => n + triangleCount(p.geometry), 0);
  const buffer = new ArrayBuffer(STL_HEADER_BYTES + 4 + total * TRIANGLE_BYTES);
  const view = new DataView(buffer);
  writeHeader(view, options.header ?? "MIST Studio design - units: mm");
  view.setUint32(STL_HEADER_BYTES, total, true);

  let offset = STL_HEADER_BYTES + 4;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const { geometry } of chosen) {
    const pos = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const count = triangleCount(geometry);
    for (let t = 0; t < count; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      for (const v of [n, a, b, c]) {
        view.setFloat32(offset, v.x, true);
        view.setFloat32(offset + 4, v.y, true);
        view.setFloat32(offset + 8, v.z, true);
        offset += 12;
      }
      view.setUint16(offset, 0, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}
