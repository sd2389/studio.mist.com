import type * as THREE from "three";
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import {
  orbitPosition,
  orbitStartFromView,
  turntableAngle,
  type Vec3,
} from "@/lib/camera-orbit";
import { loadBackdropImage, WHITE_BACKDROP, type ExportBackdrop } from "@/lib/export-backdrop";
import type { ExportLimits } from "@/lib/export-limits";
import {
  createOffscreenRenderSession,
  encodeCanvas,
  type ExportCanvas,
  type OffscreenRenderSession,
} from "@/lib/offscreen-render";
import { defaultVideoBitrate, resolveH264EncoderConfig } from "@/lib/video-codec";
import type { ViewerPostFXConfig } from "@/lib/viewer-postfx-config";

export type CameraPose = {
  cameraPosition: Vec3;
  target: Vec3;
};

export type RecordTurntableOpts = {
  gl: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  bitrate?: number;
  exposure?: number;
  postfxConfig?: ViewerPostFXConfig;
  /** Orbit pivot — pass the OrbitControls target. Defaults to the origin. */
  target?: Vec3;
  /** Painted behind transparent regions (CSS gradient / image backgrounds). */
  backdrop?: ExportBackdrop | null;
  /** The plan's cap (larger sizes are refused) and watermark (on every frame, ZIP fallback too). */
  limits: ExportLimits;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
};

export type RecordMultiAngleOpts = RecordTurntableOpts & {
  poses: CameraPose[];
};

export type VideoCaptureResult = {
  blob: Blob;
  kind: "mp4" | "png-zip";
  codec: string | null;
  /** Why the MP4 path was not used — shown to the user, never swallowed. */
  notice: string | null;
};

export const ZIP_FALLBACK_MIME = "application/zip+png-frames";

const MAX_ENCODE_QUEUE = 8;

export function isWebCodecsSupported(): boolean {
  return typeof window !== "undefined" && typeof window.VideoEncoder !== "undefined";
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export type Mp4FrameEncoder = {
  readonly codec: string;
  /** Encodes the canvas as frame `index`; resolves once the encoder has room for more. */
  addFrame(source: ExportCanvas, index: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
};

export type Mp4EncoderSetup =
  | { ok: true; encoder: Mp4FrameEncoder }
  | { ok: false; reason: string };

/** H.264 MP4 encoder with the level chosen for the resolution (see `video-codec.ts`). */
export async function createMp4FrameEncoder(spec: {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
}): Promise<Mp4EncoderSetup> {
  if (!isWebCodecsSupported()) {
    return { ok: false, reason: "This browser has no WebCodecs video encoder (use Chrome, Edge or Safari 17+)." };
  }
  const bitrate = spec.bitrate ?? defaultVideoBitrate(spec.width, spec.height, spec.fps);
  const resolved = await resolveH264EncoderConfig({ ...spec, bitrate }, (config) =>
    VideoEncoder.isConfigSupported(config),
  );
  if (!resolved.ok) return resolved;

  const source = new EncodedVideoPacketSource("avc");
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  output.addVideoTrack(source, { frameRate: spec.fps });
  await output.start();

  const pending: Promise<void>[] = [];
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      pending.push(source.add(EncodedPacket.fromEncodedChunk(chunk), meta));
    },
    error: (error) => {
      failure = error;
    },
  });
  encoder.configure(resolved.config);

  const frameDuration = Math.round(1_000_000 / spec.fps);
  const keyFrameInterval = Math.max(1, Math.round(spec.fps));

  const frameEncoder: Mp4FrameEncoder = {
    codec: resolved.codec,
    async addFrame(canvas, index) {
      if (failure) throw failure;
      const frame = new VideoFrame(canvas, { timestamp: index * frameDuration, duration: frameDuration });
      try {
        encoder.encode(frame, { keyFrame: index % keyFrameInterval === 0 });
      } finally {
        frame.close();
      }
      while (encoder.encodeQueueSize > MAX_ENCODE_QUEUE && !failure) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    },
    async finish() {
      await encoder.flush();
      encoder.close();
      if (failure) throw failure;
      await Promise.all(pending);
      await output.finalize();
      const buffer = output.target.buffer;
      if (!buffer) throw new Error("MP4 muxer finalized with an empty buffer");
      return new Blob([buffer], { type: "video/mp4" });
    },
    async cancel() {
      if (encoder.state !== "closed") encoder.close();
      await output.cancel().catch(() => undefined);
    },
  };
  return { ok: true, encoder: frameEncoder };
}

type FrameLoop = {
  frameCount: number;
  signal?: AbortSignal;
  onProgress?: (p: number) => void;
};

async function encodeMp4Frames(
  encoder: Mp4FrameEncoder,
  loop: FrameLoop,
  frameAt: (index: number) => ExportCanvas,
): Promise<Blob> {
  try {
    for (let i = 0; i < loop.frameCount; i++) {
      if (loop.signal?.aborted) throw abortError();
      await encoder.addFrame(frameAt(i), i);
      loop.onProgress?.((i + 1) / loop.frameCount);
      if (i % 4 === 3) await nextTick();
    }
    return await encoder.finish();
  } catch (error) {
    await encoder.cancel();
    throw error;
  }
}

async function encodePngZip(loop: FrameLoop, frameAt: (index: number) => Promise<Blob>): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  const pad = Math.max(3, String(loop.frameCount).length);
  for (let i = 0; i < loop.frameCount; i++) {
    if (loop.signal?.aborted) throw abortError();
    const blob = await frameAt(i);
    files[`frame_${String(i + 1).padStart(pad, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
    loop.onProgress?.((i + 1) / loop.frameCount);
    if (i % 2 === 1) await nextTick();
  }
  // PNGs are already deflated; storing keeps the fallback fast.
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped.slice().buffer as ArrayBuffer], { type: ZIP_FALLBACK_MIME });
}

function placeCamera(session: OffscreenRenderSession, pose: CameraPose): void {
  const camera = session.camera;
  camera.position.set(...pose.cameraPosition);
  camera.up.set(0, 1, 0);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld(true);
}

/** Opaque frame: the scene's own background, or the render flattened over the backdrop. */
function opaqueFrame(
  session: OffscreenRenderSession,
  timeSec: number,
  backdrop: ExportBackdrop,
  backdropImage: CanvasImageSource | null,
): ExportCanvas {
  if (session.hasOpaqueBackground) return session.render({ timeSec });
  return session.capture({ timeSec, backdrop, backdropImage, cutout: false }).flat!;
}

async function recordCameraPath(
  opts: RecordTurntableOpts,
  poseAt: (index: number) => CameraPose,
): Promise<VideoCaptureResult> {
  if (opts.frameCount < 1) throw new Error("frameCount must be >= 1");
  if (opts.fps < 1) throw new Error("fps must be >= 1");
  const backdrop = opts.backdrop ?? WHITE_BACKDROP;
  const session = await createOffscreenRenderSession(opts);
  try {
    const backdropImage = await loadBackdropImage(backdrop);
    const frameAt = (index: number) => {
      placeCamera(session, poseAt(index));
      return opaqueFrame(session, index / opts.fps, backdrop, backdropImage);
    };
    const setup = await createMp4FrameEncoder(opts);
    let notice = setup.ok ? null : setup.reason;
    if (setup.ok) {
      try {
        const blob = await encodeMp4Frames(setup.encoder, opts, frameAt);
        return { blob, kind: "mp4", codec: setup.encoder.codec, notice: null };
      } catch (error) {
        if (isAbortError(error)) throw error;
        notice = `MP4 encoding failed (${error instanceof Error ? error.message : String(error)}).`;
      }
    }
    const blob = await encodePngZip(opts, (index) => encodeCanvas(frameAt(index), "png"));
    return {
      blob,
      kind: "png-zip",
      codec: null,
      notice: `${notice} Saved ${opts.frameCount} PNG frames as a ZIP instead.`,
    };
  } finally {
    session.dispose();
  }
}

/** Cycles saved poses, holding each for an equal share of the frames. */
export function recordMultiAngle(opts: RecordMultiAngleOpts): Promise<VideoCaptureResult> {
  const poses = opts.poses.filter(Boolean);
  if (poses.length === 0) throw new Error("At least one pose is required");
  const framesPerPose = Math.max(1, Math.floor(opts.frameCount / poses.length));
  return recordCameraPath(opts, (index) => poses[Math.min(Math.floor(index / framesPerPose), poses.length - 1)]!);
}

/**
 * 360° orbit that starts from the current view: same azimuth, same height and the same
 * horizontal radius around the orbit target, so frame 0 matches what is on screen.
 */
export function recordTurntable(opts: RecordTurntableOpts): Promise<VideoCaptureResult> {
  const target: Vec3 = opts.target ?? [0, 0, 0];
  const { x, y, z } = opts.camera.position;
  const start = orbitStartFromView([x, y, z], target);
  return recordCameraPath(opts, (index) => ({
    cameraPosition: orbitPosition(start, turntableAngle(index, opts.frameCount)),
    target,
  }));
}
