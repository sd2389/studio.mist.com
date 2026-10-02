import * as THREE from "three";
import type { BuiltPart, JewelryDesign, JewelrySpecs } from "@/lib/jewelry-cad";

/**
 * Messages between the designer and its geometry worker. Geometry crosses as raw typed
 * arrays in the transfer list, so a rebuild never copies vertex data.
 */

export type BuildRequest =
  | { type: "build"; id: number; design: JewelryDesign }
  | { type: "sizes-zip"; id: number; design: JewelryDesign; name: string };

export type SerializedPart = {
  slot: BuiltPart["slot"];
  role: BuiltPart["role"];
  metal?: BuiltPart["metal"];
  gem?: BuiltPart["gem"];
  position: Float32Array;
  normal: Float32Array;
  uv?: Float32Array;
  index?: Uint32Array | Uint16Array;
};

export type BuildResponse =
  | { type: "built"; id: number; parts: SerializedPart[]; specs: JewelrySpecs }
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "zip"; id: number; bytes: Uint8Array }
  | { type: "error"; id: number; message: string };

function floatArray(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): Float32Array | undefined {
  if (!attr) return undefined;
  if (attr instanceof THREE.BufferAttribute && attr.array instanceof Float32Array) return attr.array;
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
  return out;
}

export function serializeParts(parts: BuiltPart[]): { parts: SerializedPart[]; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = [];
  const out = parts.map((p) => {
    const g = p.geometry;
    const index = g.getIndex()?.array as Uint32Array | Uint16Array | undefined;
    const serialized: SerializedPart = {
      slot: p.slot,
      role: p.role,
      metal: p.metal,
      gem: p.gem,
      position: floatArray(g.getAttribute("position"))!,
      normal: floatArray(g.getAttribute("normal"))!,
      uv: floatArray(g.getAttribute("uv")),
      index,
    };
    for (const arr of [serialized.position, serialized.normal, serialized.uv, serialized.index]) {
      if (arr && !transfer.includes(arr.buffer as ArrayBuffer)) transfer.push(arr.buffer as ArrayBuffer);
    }
    return serialized;
  });
  return { parts: out, transfer };
}

export function deserializeParts(parts: SerializedPart[]): BuiltPart[] {
  return parts.map((p) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(p.normal, 3));
    if (p.uv) g.setAttribute("uv", new THREE.BufferAttribute(p.uv, 2));
    if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return { slot: p.slot, role: p.role, metal: p.metal, gem: p.gem, geometry: g };
  });
}

/** Stable cache key for a design. */
export function designKey(design: JewelryDesign): string {
  return JSON.stringify(Object.keys(design).sort().map((k) => [k, design[k as keyof JewelryDesign]]));
}
