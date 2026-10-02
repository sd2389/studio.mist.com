import type * as THREE from "three";
import type { BuiltPart } from "@/lib/jewelry-cad";

/**
 * Shares identical stone geometry between builds.
 *
 * The ray-traced gem shader registers each gem geometry's facet planes in a page-wide
 * atlas the first time it is drawn, and those rows are never released. Most designer edits
 * (metal, band width, profile…) leave the stones exactly where they were, so handing back
 * the geometry the previous build already registered keeps the atlas from growing with
 * every slider tick. Reference counted: a geometry is disposed when no cached build uses it.
 */

function contentKey(geometry: THREE.BufferGeometry): string {
  const position = geometry.getAttribute("position").array as Float32Array;
  const words = new Uint32Array(position.buffer, position.byteOffset, position.length);
  let hash = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) {
    hash ^= words[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${words.length}:${(hash >>> 0).toString(36)}`;
}

export class GemGeometryPool {
  private readonly byKey = new Map<string, { geometry: THREE.BufferGeometry; refs: number }>();
  private readonly keyOf = new WeakMap<THREE.BufferGeometry, string>();

  /** Swap gem parts' geometry for a pooled twin when one exists. Metal parts pass through. */
  adopt(parts: BuiltPart[]): BuiltPart[] {
    return parts.map((part) => {
      if (part.role === "metal") return part;
      const key = contentKey(part.geometry);
      const hit = this.byKey.get(key);
      if (hit) {
        hit.refs++;
        part.geometry.dispose();
        return { ...part, geometry: hit.geometry };
      }
      this.byKey.set(key, { geometry: part.geometry, refs: 1 });
      this.keyOf.set(part.geometry, key);
      return part;
    });
  }

  /** Dispose a build's geometry, keeping pooled stones other builds still hold. */
  release(parts: BuiltPart[]): void {
    for (const part of parts) {
      const key = this.keyOf.get(part.geometry);
      const entry = key ? this.byKey.get(key) : undefined;
      if (!entry) {
        part.geometry.dispose();
        continue;
      }
      entry.refs--;
      if (entry.refs > 0) continue;
      this.byKey.delete(key!);
      entry.geometry.dispose();
    }
  }

  clear(): void {
    for (const { geometry } of this.byKey.values()) geometry.dispose();
    this.byKey.clear();
  }
}
