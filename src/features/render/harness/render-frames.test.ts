import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OffscreenSessionOpts, StillImageOpts } from "@/lib/offscreen-render";
import { useHiresExportStore } from "@/stores/hires-export-store";
import { sampleModelPoints } from "../campaign-pack/engine/scene-points";
import { spinFramePath, turntableFramePath } from "./frame-paths";
import { readHarnessJob, type PayloadOfKind } from "./job-payload";
import { renderSpinFiles, renderTurntableFrames } from "./render-frames";
import type { SinkClient } from "./sink-client";

/** What the stand-in session was asked to draw: where its camera stood, and when or how. */
type Draw = { position: number[]; timeSec?: number; still?: StillImageOpts };

const fake = vi.hoisted(() => ({
  opened: [] as { opts: OffscreenSessionOpts; disposed: boolean }[],
  draws: [] as Draw[],
}));

// A session that draws nothing: each frame "renders" as its index, so the pixels show which frame they are.
vi.mock("@/lib/offscreen-render", () => ({
  createOffscreenRenderSession: async (opts: OffscreenSessionOpts) => {
    const record = { opts, disposed: false };
    fake.opened.push(record);
    return { camera: opts.camera.clone(), scene: opts.scene, hasOpaqueBackground: false, dispose: () => (record.disposed = true) };
  },
  renderOpaqueFrame: ({ camera }: { camera: THREE.Camera }, timeSec: number) => {
    fake.draws.push({ position: camera.position.toArray(), timeSec });
    return { index: fake.draws.length - 1 };
  },
  renderSessionStill: async ({ camera }: { camera: THREE.Camera }, still: StillImageOpts) => {
    fake.draws.push({ position: camera.position.toArray(), still });
    return new Blob([`frame ${fake.draws.length - 1}`], { type: still.format === "jpeg" ? "image/jpeg" : "image/png" });
  },
}));
vi.mock("@/lib/export-compositing", () => ({
  makeCanvas: (width: number, height: number) => {
    let drawnIndex = -1;
    const context = {
      globalCompositeOperation: "source-over",
      drawImage: (frame: { index: number }) => (drawnIndex = frame.index),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(drawnIndex) }),
    };
    return { width, height, getContext: () => context };
  },
}));

type SinkCall =
  | { posted: "frame"; index: number; bytes: number; value: number }
  | { posted: "file"; name: string; file: Blob }
  | { posted: "progress"; progress: number };

function recordingSink(): SinkClient & { calls: SinkCall[] } {
  const calls: SinkCall[] = [];
  return {
    calls,
    fetchModel: async () => new Blob(),
    fetchInput: async () => new Blob(),
    postFile: async (name, file) => void calls.push({ posted: "file", name, file }),
    postFrame: async (index, pixels) => void calls.push({ posted: "frame", index, bytes: pixels.length, value: pixels[0]! }),
    startVideo: async () => {
      throw new Error("a turntable's one video is open from the start");
    },
    endVideo: async () => {
      throw new Error("the worker ends a turntable's one video itself");
    },
    postProgress: async (progress) => void calls.push({ posted: "progress", progress }),
  };
}

const fixture = (name: string) => JSON.parse(readFileSync(path.join(process.cwd(), `tests/goldens/fixtures/${name}.json`), "utf8"));
const SINK = { url: "http://127.0.0.1:41234", token: "f00d" };

function turntableJob(overrides: Record<string, unknown> = {}): PayloadOfKind<"turntable"> {
  const payload = readHarnessJob({ payload: { ...fixture("export-turntable"), ...overrides }, sink: SINK }).payload;
  if (payload.kind !== "turntable") throw new Error("not a turntable");
  return payload;
}

function spinJob(spec: Record<string, unknown> = {}): PayloadOfKind<"spin"> {
  const still = fixture("export-still");
  const raw = { ...still, kind: "spin", spec: { frames: 4, size: 64, format: "jpeg", jpeg_quality: 0.9, transparent: false, ...spec } };
  const payload = readHarnessJob({ payload: raw, sink: SINK }).payload;
  if (payload.kind !== "spin") throw new Error("not a spin");
  return payload;
}

beforeEach(() => {
  fake.opened.length = 0;
  fake.draws.length = 0;
  // The warmed-up stage the harness renders from; a ring-sized box to frame spins on.
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.2), new THREE.MeshStandardMaterial()));
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
  useHiresExportStore.getState().setRefs({ gl: { domElement: null } as never, scene, camera });
});

describe("renderTurntableFrames", () => {
  it("hands every frame to the sink raw and in order, each followed by the progress", async () => {
    const sink = recordingSink();
    await renderTurntableFrames(turntableJob(), sink);
    const frameBytes = 160 * 90 * 4;
    expect(sink.calls).toEqual(
      Array.from({ length: 12 }, (_, index) => [
        { posted: "frame", index, bytes: frameBytes, value: index },
        { posted: "progress", progress: (index + 1) / 12 },
      ]).flat(),
    );
    expect(fake.opened[0]!.disposed).toBe(true);
  });

  it("draws frame N on the turntable's path at N / fps, on one session at the video's size", async () => {
    const job = turntableJob();
    await renderTurntableFrames(job, recordingSink());
    const cameraAt = turntableFramePath(job.spec.path, 12, { poses: undefined, bounds: null, aspect: 160 / 90 });
    expect(fake.opened).toHaveLength(1);
    expect(fake.opened[0]!.opts).toMatchObject({ width: 160, height: 90, prepareScene: undefined });
    fake.draws.forEach((draw, index) => {
      expect(draw.timeSec).toBe(index / 30);
      draw.position.forEach((value, axis) => expect(value).toBeCloseTo(cameraAt(index).position[axis]!, 12));
    });
  });

  it("marks every frame when the owner's plan does, and keeps to the plan's size", async () => {
    await renderTurntableFrames(turntableJob({ watermark: true }), recordingSink());
    await renderTurntableFrames(turntableJob({ watermark: false }), recordingSink());
    expect(fake.opened.map(({ opts }) => opts.limits)).toEqual([
      { maxEdge: 4096, watermark: true },
      { maxEdge: 4096, watermark: false },
    ]);
  });
});

describe("renderSpinFiles", () => {
  it("hands over the frames, then the viewer that turns through them", async () => {
    const sink = recordingSink();
    const outputs = await renderSpinFiles(spinJob(), sink);
    const names = ["frame_001.jpg", "frame_002.jpg", "frame_003.jpg", "frame_004.jpg", "spin.html"];
    expect(outputs.map(({ name, content_type }) => [name, content_type])).toEqual([
      ...names.slice(0, 4).map((name) => [name, "image/jpeg"]),
      ["spin.html", "text/html"],
    ]);
    expect(outputs.every(({ width, height, label }) => width === 64 && height === 64 && label === null)).toBe(true);
    const files = sink.calls.filter((call) => call.posted === "file");
    expect(files.map((call) => call.name)).toEqual(names);
    expect(sink.calls.filter((call) => call.posted === "progress").map((call) => call.progress)).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
    const viewer = await files.at(-1)!.file.text();
    expect(viewer).toContain("<title>PDR-2413 · 360° view</title>");
    expect(viewer).toContain('"frames":["frame_001.jpg","frame_002.jpg","frame_003.jpg","frame_004.jpg"]');
  });

  it("renders each frame once, at time 0, encoded as the job asks, on the spin's orbit", async () => {
    await renderSpinFiles(spinJob(), recordingSink());
    expect(fake.opened[0]!.opts).toMatchObject({ width: 64, height: 64, limits: { maxEdge: 4096, watermark: false } });
    expect(fake.draws.map((draw) => draw.still)).toEqual(
      Array(4).fill({ transparent: false, format: "jpeg", jpegQuality: 0.9, backdrop: null, samples: 1 }),
    );
    // Framed on the model the session draws, frame by frame round the pack's orbit.
    const cameraAt = spinFramePath(4, { poses: undefined, bounds: sampleModelPoints(fake.opened[0]!.opts.scene), aspect: 1 });
    fake.draws.forEach((draw, index) => {
      draw.position.forEach((value, axis) => expect(value).toBeCloseTo(cameraAt(index).position[axis]!, 12));
    });
    expect(fake.opened[0]!.disposed).toBe(true);
  });

  it("cuts out a transparent spin: the set hidden, PNG frames", async () => {
    const sink = recordingSink();
    await renderSpinFiles(spinJob({ format: "png", transparent: true }), sink);
    expect(fake.opened[0]!.opts.prepareScene).toBeTypeOf("function");
    expect(fake.draws[0]!.still).toMatchObject({ transparent: true, format: "png", backdrop: null });
    expect(sink.calls.flatMap((call) => (call.posted === "file" ? [call.name] : []))[0]).toBe("frame_001.png");
  });
});
