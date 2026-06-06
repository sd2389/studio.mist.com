/** Browser-only GLB compression (meshopt + Draco). Loaded via dynamic import from to-glb.ts only. */

export async function compressGlbBuffer(glb: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof window === "undefined") return glb;

  const [
    { WebIO },
    { KHRDracoMeshCompression, EXTMeshoptCompression },
    { draco, meshopt },
    { MeshoptEncoder },
    draco3d,
  ] = await Promise.all([
    import("@gltf-transform/core"),
    import("@gltf-transform/extensions"),
    import("@gltf-transform/functions"),
    import("meshoptimizer"),
    import("draco3dgltf"),
  ]);

  await MeshoptEncoder.ready;

  const io = new WebIO()
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression])
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  const doc = await io.readBinary(new Uint8Array(glb));
  await doc.transform(
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    draco({ method: "edgebreaker" }),
  );
  const out = await io.writeBinary(doc);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
