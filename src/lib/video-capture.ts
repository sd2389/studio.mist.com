import * as THREE from "three";
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

export type RecordTurntableOpts = {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  bitrate?: number;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
};

export const ZIP_FALLBACK_MIME = "application/zip+png-frames";

export function isWebCodecsSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { VideoEncoder?: unknown };
  return typeof w.VideoEncoder !== "undefined";
}

type VideoEncoderStatic = {
  isConfigSupported(cfg: Record<string, unknown>): Promise<{ supported?: boolean }>;
};

type VideoEncoderCtor = (new (init: {
  output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
  error: (e: unknown) => void;
}) => VideoEncoderInst) &
  VideoEncoderStatic;

type VideoEncoderInst = {
  configure(cfg: Record<string, unknown>): void;
  encode(frame: unknown, opts?: { keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
  state: string;
};

type VideoFrameCtor = new (
  source: HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
  init?: { timestamp?: number; duration?: number },
) => { close(): void };

async function loadFflate() {
  return (await import("fflate")) as unknown as {
    zipSync: (data: Record<string, Uint8Array>, opts?: { level?: number }) => Uint8Array;
  };
}

function snapshotCamera(camera: THREE.PerspectiveCamera) {
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    aspect: camera.aspect,
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };
}

function restoreCamera(camera: THREE.PerspectiveCamera, s: ReturnType<typeof snapshotCamera>) {
  camera.position.copy(s.position);
  camera.quaternion.copy(s.quaternion);
  camera.aspect = s.aspect;
  camera.fov = s.fov;
  camera.near = s.near;
  camera.far = s.far;
  camera.updateProjectionMatrix();
}

function createOffscreenTarget(width: number, height: number) {
  return new THREE.WebGLRenderTarget(width, height, {
    samples: 4,
    colorSpace: THREE.SRGBColorSpace,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
}

function canvasFromTarget(
  gl: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  width: number,
  height: number,
  workCanvas: HTMLCanvasElement,
) {
  const pixels = new Uint8Array(width * height * 4);
  gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  workCanvas.width = width;
  workCanvas.height = height;
  const ctx = workCanvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  const img = ctx.createImageData(width, height);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * stride;
    const dst = y * stride;
    img.data.set(pixels.subarray(src, src + stride), dst);
  }
  ctx.putImageData(img, 0, 0);
  return workCanvas;
}

async function nextTick() {
  await new Promise<void>((r) => setTimeout(r, 0));
}

async function encodeMp4(
  opts: RecordTurntableOpts,
  renderFrame: (i: number) => HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob | null> {
  if (!isWebCodecsSupported()) return null;

  const w = window as unknown as { VideoEncoder: VideoEncoderCtor; VideoFrame: VideoFrameCtor };
  const codec = "avc1.640028";
  const bitrate = opts.bitrate ?? Math.round(opts.width * opts.height * opts.fps * 0.12);
  const encoderConfig = {
    codec,
    width: opts.width,
    height: opts.height,
    bitrate,
    framerate: opts.fps,
    bitrateMode: "variable" as const,
    latencyMode: "quality" as const,
  };

  const supportCheck = await w.VideoEncoder.isConfigSupported(encoderConfig);
  if (!supportCheck?.supported) return null;

  const source = new EncodedVideoPacketSource("avc");
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  output.addVideoTrack(source, { frameRate: opts.fps });
  await output.start();

  const pending: Promise<void>[] = [];
  let encoderErr: unknown = null;

  const encoder = new w.VideoEncoder({
    output: (chunk, meta) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      pending.push(source.add(packet, meta));
    },
    error: (e) => {
      encoderErr = e;
    },
  });

  encoder.configure(encoderConfig);

  const microsecPerFrame = Math.round(1_000_000 / opts.fps);

  try {
    for (let i = 0; i < opts.frameCount; i++) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const canvas = renderFrame(i);
      const vf = new w.VideoFrame(canvas, {
        timestamp: i * microsecPerFrame,
        duration: microsecPerFrame,
      });
      encoder.encode(vf as unknown as Parameters<VideoEncoderInst["encode"]>[0], {
        keyFrame: i % Math.max(1, opts.fps) === 0,
      });
      vf.close();
      opts.onProgress?.((i + 1) / opts.frameCount);
      if (encoderErr) throw encoderErr;
      if (i % 4 === 3) await nextTick();
    }

    await encoder.flush();
    encoder.close();
    if (encoderErr) throw encoderErr;

    await Promise.all(pending);
    await output.finalize();

    const buffer = output.target.buffer;
    if (!buffer) throw new Error("Mediabunny finalized with empty buffer");
    return new Blob([buffer], { type: "video/mp4" });
  } catch (e) {
    if (encoder.state !== "closed") encoder.close();
    await output.cancel().catch(() => undefined);
    throw e;
  }
}

async function encodeZip(
  opts: RecordTurntableOpts,
  renderFrame: (i: number) => HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  const fflate = await loadFflate();
  const files: Record<string, Uint8Array> = {};
  const pad = String(opts.frameCount).length;
  for (let i = 0; i < opts.frameCount; i++) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const c = renderFrame(i) as HTMLCanvasElement;
    const blob: Blob = await new Promise((resolve, reject) => {
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
    const buf = new Uint8Array(await blob.arrayBuffer());
    files[`frame_${String(i).padStart(pad, "0")}.png`] = buf;
    opts.onProgress?.((i + 1) / opts.frameCount);
    if (i % 2 === 1) await nextTick();
  }
  const zipped = fflate.zipSync(files, { level: 6 });
  const ab = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(ab).set(zipped);
  return new Blob([ab], { type: ZIP_FALLBACK_MIME });
}

export async function recordTurntable(opts: RecordTurntableOpts): Promise<Blob> {
  const { gl, scene, camera, width, height, frameCount } = opts;
  if (frameCount < 1) throw new Error("frameCount must be >= 1");
  if (opts.fps < 1) throw new Error("fps must be >= 1");

  const camSnap = snapshotCamera(camera);
  const prevTarget = gl.getRenderTarget();
  const prevAutoClear = gl.autoClear;
  const prevToneMapping = gl.toneMapping;
  const prevToneMappingExposure = gl.toneMappingExposure;
  const prevOutputColorSpace = gl.outputColorSpace;

  const radius = Math.max(camera.position.length(), 1e-4);
  const startY = camera.position.y;

  const offscreenTarget = createOffscreenTarget(width, height);
  const workCanvas = document.createElement("canvas");

  gl.autoClear = true;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = prevToneMappingExposure || 1;
  gl.outputColorSpace = THREE.SRGBColorSpace;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  function renderFrameAt(i: number): HTMLCanvasElement {
    const angle = (i / frameCount) * Math.PI * 2;
    camera.position.set(Math.cos(angle) * radius, startY, Math.sin(angle) * radius);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    gl.setRenderTarget(offscreenTarget);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    return canvasFromTarget(gl, offscreenTarget, width, height, workCanvas);
  }

  try {
    let blob: Blob | null = null;
    if (isWebCodecsSupported()) {
      try {
        blob = await encodeMp4(opts, renderFrameAt);
      } catch (e) {
        console.warn("[video-capture] MP4 encode failed, falling back to ZIP:", e);
        blob = null;
      }
    }
    if (!blob) blob = await encodeZip(opts, renderFrameAt);
    return blob;
  } finally {
    offscreenTarget.dispose();
    restoreCamera(camera, camSnap);
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAutoClear;
    gl.toneMapping = prevToneMapping;
    gl.toneMappingExposure = prevToneMappingExposure;
    gl.outputColorSpace = prevOutputColorSpace;
  }
}
