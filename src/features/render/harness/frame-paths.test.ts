import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { SavedPose } from "@/lib/slot-materials/model-config";
import { recordMultiAngle, recordTurntable, type RecordTurntableOpts } from "@/lib/video-capture";
import { mergePoses, VIEWER_FOV_DEG, VIEWER_START_POSITION } from "@/lib/viewer-scene";
import { PACK_LENS_FOV_DEG, PACK_ORBIT_AZIMUTH_DEG, PACK_ORBIT_ELEVATION_DEG } from "../campaign-pack/domain/defaults";
import { boundsFromPoints, fitOrbitDistance, projectToNdc } from "../campaign-pack/domain/framing";
import type { Vec3 } from "../campaign-pack/domain/types";
import { applyShotCamera, type ShotCamera } from "../campaign-pack/engine/pack-camera";
import type { CameraContext } from "./cameras";
import { spinFramePath, turntableFramePath } from "./frame-paths";
import type { TurntablePath } from "./job-payload";

/** Where a frame's camera stood, how it was turned, through which lens, and when. */
type FrameCamera = { position: number[]; quaternion: number[]; fov: number; timeSec: number };

// The studio's video export draws on a stand-in session that notes each frame's camera.
const drawn = vi.hoisted(() => [] as FrameCamera[]);
vi.mock("@/lib/offscreen-render", () => ({
  createOffscreenRenderSession: async ({ camera, width, height }: RecordTurntableOpts) => {
    // As the real session: a private copy of the live camera, at the video's shape.
    const exportCamera = camera.clone();
    exportCamera.aspect = width / height;
    exportCamera.updateProjectionMatrix();
    return { camera: exportCamera, hasOpaqueBackground: true, dispose: () => undefined };
  },
  renderOpaqueFrame: ({ camera }: { camera: THREE.PerspectiveCamera }, timeSec: number) => {
    drawn.push({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, timeSec });
    return {};
  },
  encodeCanvas: async () => new Blob([new Uint8Array(1)]),
}));

const WIDTH = 160;
const HEIGHT = 90;
const FPS = 30;
const VIEW = { position: [0.62, 0.88, 2.25] as Vec3, target: [0.1, 0.05, -0.2] as Vec3 };
const HERO: SavedPose = { id: "pose-hero", name: "Hero", cameraPosition: [1.2, 0.6, 1.8], target: [0, 0.1, 0] };

/** The live view, as the studio's video export finds it: the viewer's camera and its orbit target. */
function recordingOptions(frameCount: number): RecordTurntableOpts {
  const camera = new THREE.PerspectiveCamera(VIEWER_FOV_DEG, 1, 0.01, 200);
  camera.position.set(...VIEW.position);
  return {
    gl: {} as RecordTurntableOpts["gl"],
    scene: new THREE.Scene(),
    camera,
    width: WIDTH,
    height: HEIGHT,
    frameCount,
    fps: FPS,
    target: VIEW.target,
    limits: { maxEdge: 4096, watermark: false },
  };
}

/** Every frame's camera as the studio's video export moves it. */
async function recordedInBrowser(record: () => Promise<unknown>): Promise<FrameCamera[]> {
  drawn.length = 0;
  await record();
  return [...drawn];
}

/** Every frame's camera as the harness moves it: placed on the session's camera, drawn at N / fps. */
function renderedInHarness(path: TurntablePath, frames: number, poses: SavedPose[] = []): FrameCamera[] {
  const context: CameraContext = { poses, bounds: null, aspect: WIDTH / HEIGHT };
  const cameraAt = turntableFramePath(path, frames, context);
  const camera = new THREE.PerspectiveCamera(VIEWER_FOV_DEG, WIDTH / HEIGHT, 0.01, 200);
  return Array.from({ length: frames }, (_, index) => {
    applyShotCamera(camera, cameraAt(index));
    return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, timeSec: index / FPS };
  });
}

function expectSameCameras(actual: FrameCamera[], expected: FrameCamera[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((frame, index) => {
    const want = expected[index]!;
    frame.position.forEach((value, axis) => expect(value, `frame ${index} position`).toBeCloseTo(want.position[axis]!, 12));
    frame.quaternion.forEach((value, axis) => expect(value, `frame ${index} rotation`).toBeCloseTo(want.quaternion[axis]!, 12));
    expect(frame.fov, `frame ${index} lens`).toBe(want.fov);
    expect(frame.timeSec, `frame ${index} time`).toBe(want.timeSec);
  });
}

describe("turntableFramePath", () => {
  it("orbits from the live view exactly as the studio's turntable export does, frame for frame", async () => {
    const browser = await recordedInBrowser(() => recordTurntable(recordingOptions(12)));
    const harness = renderedInHarness({ orbit: { start: { view: VIEW } } }, 12);
    expectSameCameras(harness, browser);
    // Frame 0 is the view itself; frame 3 of 12 is a quarter turn round its target, as high.
    harness[0]!.position.forEach((value, axis) => expect(value).toBeCloseTo(VIEW.position[axis]!, 12));
    const across = (frame: FrameCamera) => [frame.position[0]! - VIEW.target[0], frame.position[2]! - VIEW.target[2]];
    const [x0, z0] = across(harness[0]!);
    const [x3, z3] = across(harness[3]!);
    expect(x0! * x3! + z0! * z3!).toBeCloseTo(0, 12);
    expect(harness[3]!.position[1]).toBeCloseTo(VIEW.position[1], 12);
  });

  it("cuts through the poses exactly as the studio's multi-angle export does, the last pose keeping the rest", async () => {
    const poses = mergePoses([HERO]);
    const browserPoses = poses.map((pose) => ({ cameraPosition: pose.cameraPosition, target: pose.target }));
    const browser = await recordedInBrowser(() => recordMultiAngle({ ...recordingOptions(11), poses: browserPoses }));
    const harness = renderedInHarness({ poses: poses.map((pose) => pose.id) }, 11, [HERO]);
    expectSameCameras(harness, browser);
    // Five poses over eleven frames: two frames each, the last pose holding three.
    const heldBy = (frame: FrameCamera) => poses.findIndex((pose) => pose.cameraPosition.every((v, axis) => Math.abs(v - frame.position[axis]!) < 1e-12));
    expect(harness.map(heldBy)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
  });

  it("orbits from a saved pose through the viewer's lens", () => {
    const [first] = renderedInHarness({ orbit: { start: { pose: "pose-hero" } } }, 8, [HERO]);
    first!.position.forEach((value, axis) => expect(value).toBeCloseTo(HERO.cameraPosition[axis]!, 12));
    expect(first!.fov).toBe(VIEWER_FOV_DEG);
  });
});

/** A ring's worth of points: a band standing in the XY plane and a stone on top of it. */
function ringPoints(): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < 64; i += 1) {
    const a = (i / 64) * Math.PI * 2;
    points.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5 - 0.1, 0.06], [Math.cos(a) * 0.5, Math.sin(a) * 0.5 - 0.1, -0.06]);
  }
  points.push([0, 0.62, 0], [0.12, 0.5, 0], [-0.12, 0.5, 0]);
  return points;
}

const degrees = (radians: number) => (radians * 180) / Math.PI;
const offsetOf = (shot: ShotCamera): Vec3 => [
  shot.position[0] - shot.target[0],
  shot.position[1] - shot.target[1],
  shot.position[2] - shot.target[2],
];

describe("spinFramePath", () => {
  const bounds = boundsFromPoints(ringPoints())!;
  const context: CameraContext = { poses: undefined, bounds, aspect: 1 };
  const frames = 72;
  const cameraAt = spinFramePath(frames, context);

  it("turns once round the piece on the Campaign Pack's spin orbit: 20° up, from 35° round", () => {
    const distance = fitOrbitDistance({
      points: bounds.points,
      target: bounds.center,
      elevationDeg: PACK_ORBIT_ELEVATION_DEG,
      fovYDeg: PACK_LENS_FOV_DEG,
      aspect: 1,
      margin: 0.08,
    });
    for (const index of [0, 9, 18, 45, 71]) {
      const shot = cameraAt(index);
      const [dx, dy, dz] = offsetOf(shot);
      expect(shot.fovDeg).toBe(PACK_LENS_FOV_DEG);
      expect(shot.target).toEqual(bounds.center);
      expect(Math.hypot(dx, dy, dz)).toBeCloseTo(distance, 9);
      expect(degrees(Math.asin(dy / distance))).toBeCloseTo(PACK_ORBIT_ELEVATION_DEG, 9);
      const azimuth = (degrees(Math.atan2(dx, dz)) + 360) % 360;
      expect(azimuth).toBeCloseTo((PACK_ORBIT_AZIMUTH_DEG + (360 * index) / frames) % 360, 9);
    }
  });

  it("keeps the whole piece inside the pack's 8% margin on every frame", () => {
    for (let index = 0; index < frames; index += 1) {
      const shot = cameraAt(index);
      const ndc = bounds.points.map((point) => projectToNdc({ ...shot, distance: 0 }, point, shot.fovDeg, 1));
      expect(Math.max(...ndc.flat().map(Math.abs))).toBeLessThanOrEqual(0.84 + 1e-9);
    }
  });

  it("comes back round: the frame after the last would be frame 0", () => {
    cameraAt(frames).position.forEach((value, axis) => expect(value).toBeCloseTo(cameraAt(0).position[axis]!, 12));
  });

  it("turns from the viewer's opening view when there is nothing to frame", () => {
    const shot = spinFramePath(frames, { ...context, bounds: null })(0);
    expect(shot.position.map((value, axis) => value - VIEWER_START_POSITION[axis]!).every((d) => Math.abs(d) < 1e-12)).toBe(true);
    expect(shot.fovDeg).toBe(VIEWER_FOV_DEG);
  });
});
