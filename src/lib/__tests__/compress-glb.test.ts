import { WebIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRDracoMeshCompression } from "@gltf-transform/extensions";
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

type GltfJson = {
  asset?: { version?: string };
  extensionsRequired?: string[];
  accessors?: { count: number }[];
  meshes?: { primitives: { indices?: number; mode?: number; attributes: { POSITION: number } }[] }[];
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
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression])
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
});
