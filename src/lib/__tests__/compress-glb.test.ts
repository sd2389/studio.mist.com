import { WebIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRDracoMeshCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder } from "meshoptimizer";
import { beforeAll, describe, expect, it } from "vitest";
import { compressGlbBuffer } from "@/lib/convert/compress-glb.client";
import { convertUploadToGlb } from "@/lib/convert/to-glb";
import { buildRingFixture } from "./fixtures/jewelry-fixtures";
import { toBinaryStl } from "./fixtures/mesh-writers";
import { installNodeFileReader } from "./fixtures/node-file-reader";

/**
 * Uploads are compressed in the browser before they are stored. This runs the same code in
 * Node on the GLB the upload page exports, and holds the result to the rules the server
 * applies to every stored model (backend/app/services/glb.py). The backend suite runs a
 * GLB made by this function (backend/tests/fixtures/demo-ring-draco-meshopt.glb) through
 * those checks themselves.
 */

type GltfAccessor = { count: number; componentType: number; normalized?: boolean; bufferView?: number };

type GltfPrimitive = {
  indices?: number;
  mode?: number;
  attributes: { POSITION: number } & Record<string, number>;
  extensions?: Record<string, unknown>;
};

type GltfJson = {
  asset?: { version?: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  accessors?: GltfAccessor[];
  buffers?: { uri?: string; extensions?: { EXT_meshopt_compression?: { fallback?: boolean } } }[];
  meshes?: { primitives: GltfPrimitive[] }[];
  nodes?: { mesh?: number }[];
};

const JSON_CHUNK = 0x4e4f534a;

/** The server's container rules: magic "glTF", version 2, a header length equal to the file
 * size, chunks that fit and end the file, a JSON first chunk declaring glTF 2.0. */
function readGlbJson(buffer: ArrayBuffer): GltfJson {
  const view = new DataView(buffer);
  expect(new TextDecoder().decode(new Uint8Array(buffer, 0, 4))).toBe("glTF");
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(buffer.byteLength);
  let json: GltfJson | undefined;
  let offset = 12;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    offset = start + length;
    expect(offset).toBeLessThanOrEqual(buffer.byteLength);
    if (!json) {
      expect(type).toBe(JSON_CHUNK);
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length))) as GltfJson;
    }
  }
  expect(offset).toBe(buffer.byteLength);
  expect(json?.asset?.version).toMatch(/^2\./);
  return json as GltfJson;
}

/** Triangles as the server counts them: each placed mesh's triangle-list accessor counts. */
function countDeclaredTriangles(json: GltfJson): number {
  const accessors = json.accessors ?? [];
  const perMesh = (json.meshes ?? []).map((mesh) =>
    mesh.primitives.reduce((sum, primitive) => {
      expect(primitive.mode ?? 4).toBe(4);
      return sum + Math.floor(accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3);
    }, 0),
  );
  return (json.nodes ?? []).reduce((sum, node) => sum + (node.mesh === undefined ? 0 : perMesh[node.mesh]), 0);
}

/** Triangles left after actually decoding the Draco and meshopt data. */
async function countDecodedTriangles(glb: ArrayBuffer): Promise<number> {
  await MeshoptDecoder.ready;
  const io = new WebIO()
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "meshopt.decoder": MeshoptDecoder,
    });
  const doc = await io.readBinary(new Uint8Array(glb));
  let triangles = 0;
  for (const node of doc.getRoot().listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const counted = primitive.getIndices() ?? primitive.getAttribute("POSITION");
      triangles += Math.floor((counted?.getCount() ?? 0) / 3);
    }
  }
  return triangles;
}

async function exportedRingGlb(): Promise<ArrayBuffer> {
  const file = new File([toBinaryStl(buildRingFixture().soup)], "ring.stl");
  const converted = await convertUploadToGlb(file, { generateThumbnail: false, compress: false });
  return converted.glb.arrayBuffer();
}

const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const FLOAT = 5126;

/** Whether core glTF 2.0 allows the attribute's type, or it takes KHR_mesh_quantization. */
function isCoreAttributeType(semantic: string, { componentType, normalized = false }: GltfAccessor): boolean {
  const isSmallUnsigned = componentType === UNSIGNED_BYTE || componentType === UNSIGNED_SHORT;
  if (semantic.startsWith("_")) return true; // application-specific: any type
  if (/^JOINTS_\d+$/.test(semantic)) return isSmallUnsigned && !normalized;
  if (componentType === FLOAT) return true;
  return /^(TEXCOORD|COLOR|WEIGHTS)_\d+$/.test(semantic) && isSmallUnsigned && normalized;
}

function listPrimitives(json: GltfJson): GltfPrimitive[] {
  return (json.meshes ?? []).flatMap((mesh) => mesh.primitives);
}

function hasQuantizedAttributes(json: GltfJson): boolean {
  const accessors = json.accessors ?? [];
  return listPrimitives(json).some((primitive) =>
    Object.entries(primitive.attributes).some(([semantic, index]) => !isCoreAttributeType(semantic, accessors[index])),
  );
}

/** The name of every extension object in the file (extras are application data, not glTF). */
function listExtensionObjects(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(listExtensionObjects);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    if (key === "extras") return [];
    if (key === "extensions" && child && typeof child === "object") {
      return [...Object.keys(child), ...listExtensionObjects(child)];
    }
    return listExtensionObjects(child);
  });
}

/** The extensions the file's contents use; KHR_mesh_quantization has no object of its own. */
function listExtensionsInUse(json: GltfJson): string[] {
  const used = new Set(listExtensionObjects(json));
  if (hasQuantizedAttributes(json)) used.add("KHR_mesh_quantization");
  return [...used].sort();
}

/** The extensions a loader can't do without, by each extension's rule for being required. */
function listExtensionsNeeded(json: GltfJson): string[] {
  const accessors = json.accessors ?? [];
  const needed: string[] = [];
  // KHR_mesh_quantization is never optional.
  if (hasQuantizedAttributes(json)) needed.push("KHR_mesh_quantization");
  // Draco with no uncompressed fallback: its primitives' accessors have no buffer view.
  const isDracoOnly = listPrimitives(json).some(
    (primitive) =>
      primitive.extensions?.KHR_draco_mesh_compression &&
      Object.values(primitive.attributes).some((index) => accessors[index].bufferView === undefined),
  );
  if (isDracoOnly) needed.push("KHR_draco_mesh_compression");
  // meshopt with no uncompressed fallback: the fallback buffer has no data.
  if (json.buffers?.some((buffer) => buffer.extensions?.EXT_meshopt_compression?.fallback && !buffer.uri)) {
    needed.push("EXT_meshopt_compression");
  }
  return needed.sort();
}

function expectDeclaredExtensionsMatchContents(json: GltfJson): void {
  expect([...(json.extensionsUsed ?? [])].sort()).toEqual(listExtensionsInUse(json));
  expect([...(json.extensionsRequired ?? [])].sort()).toEqual(listExtensionsNeeded(json));
}

beforeAll(installNodeFileReader);

describe("compressGlbBuffer", () => {
  it("makes the exported GLB smaller, and still one the server stores", { timeout: 60_000 }, async () => {
    const glb = await exportedRingGlb();

    const compressed = await compressGlbBuffer(glb);

    expect(compressed.byteLength).toBeLessThan(glb.byteLength);
    const json = readGlbJson(compressed);
    expect(json.extensionsRequired).toEqual(
      expect.arrayContaining(["KHR_draco_mesh_compression", "EXT_meshopt_compression"]),
    );
    const triangles = countDeclaredTriangles(readGlbJson(glb));
    expect(triangles).toBeGreaterThan(0);
    expect(countDeclaredTriangles(json)).toBe(triangles);
    expect(await countDecodedTriangles(compressed)).toBe(triangles);
  });

  it("declares exactly the extensions the GLB's contents use", { timeout: 60_000 }, async () => {
    const glb = await exportedRingGlb();
    const exported = readGlbJson(glb);
    expect(hasQuantizedAttributes(exported)).toBe(false);
    expectDeclaredExtensionsMatchContents(exported);

    const compressed = readGlbJson(await compressGlbBuffer(glb));

    expect(hasQuantizedAttributes(compressed)).toBe(true);
    expect(listExtensionsInUse(compressed)).toEqual(
      ["EXT_meshopt_compression", "KHR_draco_mesh_compression", "KHR_mesh_quantization"],
    );
    expectDeclaredExtensionsMatchContents(compressed);
  });
});
