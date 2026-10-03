import { readViewportBackdrop } from "@/lib/export-backdrop";
import { createOffscreenRenderSession, renderSessionStill } from "@/lib/offscreen-render";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { applyShotCamera } from "../campaign-pack/engine/pack-camera";
import { sampleModelPoints } from "../campaign-pack/engine/scene-points";
import { prepareCutoutScene } from "../lib/stage-visibility";
import { cameraLabel, resolveShotCamera } from "./cameras";
import { jobCameras, type RenderedFile, type RenderJobPayload } from "./job-payload";
import type { SinkClient } from "./sink-client";

/**
 * Renders every image of a still or an angle set from the loaded, warmed-up scene: one
 * offscreen session (the hi-res export's pipeline), one camera after another. Each file goes
 * to the sink as soon as it is encoded, and the next waits until the worker has it.
 */
export async function renderJobImages(payload: RenderJobPayload, sink: SinkClient): Promise<RenderedFile[]> {
  const refs = getHiresRefs();
  if (!refs) throw new Error("The scene has not loaded.");
  const { spec } = payload;
  const cameras = jobCameras(payload);
  const { exposure, postfxConfig } = getRenderFidelity();
  const session = await createOffscreenRenderSession({
    gl: refs.gl,
    scene: refs.scene,
    camera: refs.camera,
    width: spec.width,
    height: spec.height,
    exposure,
    postfxConfig,
    // Cutouts are the piece alone: no studio set, no contact-shadow catcher.
    prepareScene: spec.transparent ? prepareCutoutScene : undefined,
    // The API checked the size against the owner's plan and decided the mark when it made the job.
    limits: { maxEdge: payload.limits.max_edge, watermark: payload.watermark },
  });
  try {
    const context = {
      poses: payload.look.scene_settings.poses,
      bounds: cameras.some((camera) => "angle" in camera) ? sampleModelPoints(session.scene) : null,
      aspect: spec.width / spec.height,
    };
    // JPEG has no alpha: transparent areas become white; otherwise flatten the CSS backdrop.
    const backdrop = spec.transparent ? null : readViewportBackdrop(refs.gl.domElement);
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
