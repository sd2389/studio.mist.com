import { readViewportBackdrop, type ExportBackdrop } from "@/lib/export-backdrop";
import { createOffscreenRenderSession, type OffscreenRenderSession } from "@/lib/offscreen-render";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { sampleModelPoints } from "../campaign-pack/engine/scene-points";
import { prepareCutoutScene } from "../lib/stage-visibility";
import type { CameraContext } from "./cameras";
import type { RenderJobPayload } from "./job-payload";

export type JobSession = {
  session: OffscreenRenderSession;
  /** The CSS backdrop behind the stage, which opaque images are flattened onto; none for a cutout. */
  backdrop: ExportBackdrop | null;
};

type SessionSize = { width: number; height: number; transparent: boolean };

/**
 * One offscreen session (the hi-res export's pipeline) on the loaded, warmed-up stage, for every
 * image or frame of a job: at the job's size, the set and shadow hidden for a cutout, and the
 * payload's size cap and watermark, so every image and frame it hands out carries the mark
 * when the owner's plan has one.
 */
export async function openJobSession(payload: RenderJobPayload, { width, height, transparent }: SessionSize): Promise<JobSession> {
  const refs = getHiresRefs();
  if (!refs) throw new Error("The scene has not loaded.");
  const { exposure, postfxConfig } = getRenderFidelity();
  const session = await createOffscreenRenderSession({
    gl: refs.gl,
    scene: refs.scene,
    camera: refs.camera,
    width,
    height,
    exposure,
    postfxConfig,
    // Cutouts are the piece alone: no studio set, no contact-shadow catcher.
    prepareScene: transparent ? prepareCutoutScene : undefined,
    // The API checked the size against the owner's plan and decided the mark when it made the job.
    limits: { maxEdge: payload.limits.max_edge, watermark: payload.watermark },
  });
  // JPEG has no alpha: transparent areas become white; otherwise flatten the CSS backdrop.
  return { session, backdrop: transparent ? null : readViewportBackdrop(refs.gl.domElement) };
}

/**
 * What a job's cameras are placed with: the look's saved poses, the model's bounds when a camera
 * is framed on them (sampling them costs a pass over the vertices), and the image's shape.
 */
export function jobCameraContext(
  payload: RenderJobPayload,
  session: OffscreenRenderSession,
  aspect: number,
  shouldSampleBounds: boolean,
): CameraContext {
  return {
    poses: payload.look.scene_settings.poses,
    bounds: shouldSampleBounds ? sampleModelPoints(session.scene) : null,
    aspect,
  };
}
