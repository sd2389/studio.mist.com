import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import type { FormatLoader } from "../types";

/** Face count from the (always ASCII) PLY header; 0 means a point cloud. */
export function plyFaceCount(buffer: ArrayBuffer): number {
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096)));
  const header = head.split(/end_header/)[0] ?? "";
  const match = header.match(/element\s+face\s+(\d+)/);
  return match ? Number(match[1]) : 0;
}

export const loadPly: FormatLoader = async (file) => {
  const buffer = await file.arrayBuffer();
  if (plyFaceCount(buffer) === 0) {
    throw new Error("This PLY is a point cloud (no faces) — export it as a mesh.");
  }
  const geometry = new PLYLoader().parse(buffer);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry));
  return { root, declaredMmPerUnit: null, slotSource: "shape" };
};
