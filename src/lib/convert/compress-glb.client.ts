/**
 * GLB compression for uploads (meshopt, then Draco). to-glb.ts imports it on demand in the
 * browser and keeps the uncompressed GLB, with a warning, if it throws.
 */

/**
 * Where Draco's Emscripten builds find their WASM. They look next to the script that loaded them,
 * where the app serves nothing, so in the browser the decoder failed to load, compression threw
 * and every upload went out uncompressed. webpack emits both files with the app's static assets;
 * in Node (the tests) the builds find them beside themselves.
 */
function dracoWasm(url: () => URL): { locateFile?: () => string } {
  return typeof window === "undefined" ? {} : { locateFile: () => url().href };
}

export async function compressGlbBuffer(glb: ArrayBuffer): Promise<ArrayBuffer> {
  const [
    { WebIO },
    { KHRDracoMeshCompression, EXTMeshoptCompression, KHRMeshQuantization },
    { draco, meshopt },
    { MeshoptDecoder, MeshoptEncoder },
    draco3d,
  ] = await Promise.all([
    import("@gltf-transform/core"),
    import("@gltf-transform/extensions"),
    import("@gltf-transform/functions"),
    import("meshoptimizer"),
    import("draco3dgltf"),
  ]);

  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);

  // Every codec the two extensions use. Without "meshopt.encoder", writing the meshopt
  // buffers throws, and every upload went out uncompressed. KHR_mesh_quantization has no codec:
  // meshopt() adds it to the document when it quantizes an attribute, and the writer leaves out
  // (with only a console warning) any extension the IO doesn't register, so the 16-bit positions
  // and normals went out undeclared.
  const io = new WebIO()
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(
        dracoWasm(() => new URL("draco3dgltf/draco_decoder_gltf.wasm", import.meta.url)),
      ),
      "draco3d.encoder": await draco3d.createEncoderModule(
        dracoWasm(() => new URL("draco3dgltf/draco_encoder.wasm", import.meta.url)),
      ),
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });

  const doc = await io.readBinary(new Uint8Array(glb));
  await doc.transform(
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    draco({ method: "edgebreaker" }),
  );
  const out = await io.writeBinary(doc);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
