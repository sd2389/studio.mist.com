import { renderSessionStill } from "@/lib/offscreen-render";
import { applyShotCamera } from "../campaign-pack/engine/pack-camera";
import { cameraLabel, resolveShotCamera } from "./cameras";
import { jobCameras, type PayloadOfKind, type RenderedFile } from "./job-payload";
import { jobCameraContext, openJobSession } from "./job-session";
import type { SinkClient } from "./sink-client";

/**
 * Renders every image of a still or an angle set from the loaded, warmed-up scene: one
 * offscreen session (the hi-res export's pipeline), one camera after another. Each file goes
 * to the sink as soon as it is encoded, and the next waits until the worker has it.
 */
export async function renderJobImages(payload: PayloadOfKind<"still" | "angle_set">, sink: SinkClient): Promise<RenderedFile[]> {
  const { spec } = payload;
  const cameras = jobCameras(payload);
  const { session, backdrop } = await openJobSession(payload, spec);
  try {
    const hasFramedAngle = cameras.some((camera) => "angle" in camera);
    const context = jobCameraContext(payload, session, spec.width / spec.height, hasFramedAngle);
    const files: RenderedFile[] = [];
    for (const [index, camera] of cameras.entries()) {
      applyShotCamera(session.camera, resolveShotCamera(camera, context));
      const image = await renderSessionStill(session, {
        transparent: spec.transparent,
        format: spec.format,
        jpegQuality: spec.jpeg_quality,
        backdrop,
      });
      const name = spec.output_names[index]!;
      await sink.postFile(name, image);
      files.push({ name, content_type: image.type, width: spec.width, height: spec.height, label: cameraLabel(camera) });
      await sink.postProgress((index + 1) / cameras.length, "rendering");
    }
    return files;
  } finally {
    session.dispose();
  }
}
