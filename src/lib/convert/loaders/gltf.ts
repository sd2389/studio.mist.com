import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { FormatLoader } from "../types";

/** Same decoder build the viewer's useGLTF fetches, so the browser cache is shared. */
const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.5/";

type GltfJson = { buffers?: { uri?: string }[]; images?: { uri?: string }[] };

function parseGltfJson(buffer: ArrayBuffer): GltfJson | null {
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  if (String.fromCharCode(...head) === "glTF") return null;
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as GltfJson;
  } catch {
    return null;
  }
}

/** A .gltf's external .bin must come with it; missing textures are tolerated. */
function assertBuffersProvided(buffer: ArrayBuffer, find: (reference: string) => File | null): void {
  const json = parseGltfJson(buffer);
  const missing = (json?.buffers ?? [])
    .map((entry) => entry.uri)
    .filter((uri): uri is string => typeof uri === "string" && !uri.startsWith("data:") && !find(uri));
  if (missing.length > 0) {
    throw new Error(`This glTF needs ${missing.join(", ")} — select it together with the .gltf file.`);
  }
}

export const loadGltf: FormatLoader = async (file, { companions }) => {
  const buffer = await file.arrayBuffer();
  assertBuffersProvided(buffer, companions.find);
  const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader(companions.manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.parseAsync(buffer, "");
    // glTF is metres by spec; the plausibility check catches millimetre-as-metre exports.
    return { root: gltf.scene, declaredMmPerUnit: 1000, slotSource: "names" };
  } finally {
    draco.dispose();
  }
};
