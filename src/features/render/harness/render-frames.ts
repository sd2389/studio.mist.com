import { loadBackdropImage, WHITE_BACKDROP } from "@/lib/export-backdrop";
import { makeCanvas, type Canvas2D, type ExportCanvas } from "@/lib/export-compositing";
import { renderOpaqueFrame, renderSessionStill } from "@/lib/offscreen-render";
import { applyShotCamera } from "../campaign-pack/engine/pack-camera";
import { spinFramePath, turntableFramePath } from "./frame-paths";
import type { PayloadOfKind, RenderedFile } from "./job-payload";
import { jobCameraContext, openJobSession } from "./job-session";
import type { SinkClient } from "./sink-client";
import { SPIN_VIEWER_NAME, spinFrameNames, spinViewerPage } from "./spin-files";

/** Raw RGBA of a frame, read through one 2D surface: a WebGPU canvas has no context to read. */
export function createPixelReader(width: number, height: number): (frame: ExportCanvas) => Uint8ClampedArray<ArrayBuffer> {
  const surface = makeCanvas(width, height);
  const context = surface.getContext("2d", { willReadFrequently: true }) as Canvas2D | null;
  if (!context) throw new Error("2D canvas unavailable to read video frames");
  context.globalCompositeOperation = "copy";
  return (frame) => {
    context.drawImage(frame, 0, 0);
    return context.getImageData(0, 0, width, height).data;
  };
}

/**
 * Renders a turntable from the loaded, warmed-up scene, as the studio's video export recorded
 * one: frame N's camera on the turntable's path, one sample at N / fps on the capture clock,
 * flattened onto the look's backdrop (white without one). Each frame goes to the sink raw, in
 * order, and the next waits until the worker has it; the worker encodes the MP4.
 */
export async function renderTurntableFrames(payload: PayloadOfKind<"turntable">, sink: SinkClient): Promise<void> {
  const { spec } = payload;
  const { session, backdrop } = await openJobSession(payload, { width: spec.width, height: spec.height, transparent: false });
  try {
    const startsOnAngle = "orbit" in spec.path && "angle" in spec.path.orbit.start;
    const context = jobCameraContext(payload, session, spec.width / spec.height, startsOnAngle);
    const cameraAt = turntableFramePath(spec.path, spec.frames, context);
    const flattenOnto = backdrop ?? WHITE_BACKDROP;
    const backdropImage = await loadBackdropImage(flattenOnto);
    const readPixels = createPixelReader(spec.width, spec.height);
    for (let index = 0; index < spec.frames; index += 1) {
      applyShotCamera(session.camera, cameraAt(index));
      // Read before awaiting anything: the next render replaces the frame.
      const pixels = readPixels(renderOpaqueFrame(session, index / spec.fps, flattenOnto, backdropImage));
      await sink.postFrame(index, pixels);
      await sink.postProgress((index + 1) / spec.frames, "rendering");
    }
  } finally {
    session.dispose();
  }
}

/**
 * Renders a spin from the loaded, warmed-up scene, as the Campaign Pack renders its spins: each
 * frame on the pack's spin orbit, one sample at time 0, encoded as the job asks. The frames go
 * to the sink as files, then `spin.html`, the viewer that turns through them.
 */
export async function renderSpinFiles(payload: PayloadOfKind<"spin">, sink: SinkClient): Promise<RenderedFile[]> {
  const { spec } = payload;
  const { session, backdrop } = await openJobSession(payload, { width: spec.size, height: spec.size, transparent: spec.transparent });
  try {
    // Square frames, every one framed on the model.
    const cameraAt = spinFramePath(spec.frames, jobCameraContext(payload, session, 1, true));
    const names = spinFrameNames(spec);
    const files: RenderedFile[] = [];
    const post = async (name: string, file: Blob) => {
      await sink.postFile(name, file);
      files.push({ name, content_type: file.type, width: spec.size, height: spec.size, label: null });
      await sink.postProgress(files.length / (names.length + 1), "rendering");
    };
    for (const [index, name] of names.entries()) {
      applyShotCamera(session.camera, cameraAt(index));
      const frame = await renderSessionStill(session, {
        transparent: spec.transparent,
        format: spec.format,
        jpegQuality: spec.jpeg_quality,
        backdrop,
        samples: 1,
      });
      await post(name, frame);
    }
    await post(SPIN_VIEWER_NAME, new Blob([spinViewerPage(payload, names)], { type: "text/html" }));
    return files;
  } finally {
    session.dispose();
  }
}
