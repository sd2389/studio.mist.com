/**
 * GLB compression for uploads (meshopt, then Draco). to-glb.ts imports it on demand in the
 * browser and keeps the uncompressed GLB, with a warning, if it throws.
 */

export async function compressGlbBuffer(glb: ArrayBuffer): Promise<ArrayBuffer> {
  const [
    { WebIO },
    { KHRDracoMeshCompression, EXTMeshoptCompression },
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
  // buffers throws, and every upload went out uncompressed.
  const io = new WebIO()
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression])
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
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
