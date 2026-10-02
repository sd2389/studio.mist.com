import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { FormatLoader } from "../types";

/** STL is one unitless, unlabelled triangle soup: every slot comes from shape analysis. */
export const loadStl: FormatLoader = async (file) => {
  const geometry = new STLLoader().parse(await file.arrayBuffer());
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry));
  return { root, declaredMmPerUnit: null, slotSource: "shape" };
};
