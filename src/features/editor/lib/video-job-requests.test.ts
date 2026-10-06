import { describe, expect, it } from "vitest";
import type { RenderJobCamera } from "@/features/render";
import type { LookSnapshot } from "@/features/viewer";
import { mergePoses } from "@/lib/viewer-scene";
import { videoJobRequests, type VideoJobsInput } from "./video-job-requests";

const LIVE_VIEW: RenderJobCamera = { view: { position: [0.5, 0.75, 2], target: [0, 0.1, 0] } };
const LOOK = { material: "platinum", lighting: "studio", scene_settings: {} } as unknown as LookSnapshot;
const HERO = { id: "pose-lxk2", name: "Hero", cameraPosition: [1.2, 0.6, 1.8] as [number, number, number], target: [0, 0, 0] as [number, number, number] };

/** The Videos tab's defaults: 1080p, 4 s at 30 fps, encoded at "high". */
const INPUT: VideoJobsInput = {
  mode: "simple",
  settings: { width: 1920, height: 1080, fps: 30, frames: 120, quality: "high" },
  camera: LIVE_VIEW,
  poses: mergePoses([HERO]),
  sceneId: 812,
  look: LOOK,
  viewerId: "ring-abc",
  targets: null,
};

const SIZE = { width: 1920, height: 1080, fps: 30, frames: 120, quality: "high" };

describe("videoJobRequests", () => {
  it("Simple: one turntable orbiting from the live view, with the studio's look", () => {
    expect(videoJobRequests(INPUT)).toEqual([
      {
        kind: "turntable",
        scene_id: 812,
        variant_id: null,
        look: LOOK,
        name: "ring-abc-360",
        spec: { ...SIZE, path: { orbit: { start: LIVE_VIEW } } },
      },
    ]);
  });

  it("Multi-angle: one turntable cutting through the studio's four poses, then the saved ones", () => {
    expect(videoJobRequests({ ...INPUT, mode: "multi-angle" })).toEqual([
      {
        kind: "turntable",
        scene_id: 812,
        variant_id: null,
        look: LOOK,
        name: "ring-abc-multi-angle",
        spec: { ...SIZE, path: { poses: ["pose-top", "pose-right", "pose-default", "pose-left", "pose-lxk2"] } },
      },
    ]);
  });

  it("Multiple: an orbit from the live view for each scene and variant picked, the current scene in the studio's look", () => {
    const targets = [
      { sceneId: 812, variantId: null, live: true, label: "ring-abc-live" },
      { sceneId: 812, variantId: "variant-rose", live: false, label: "ring-abc-rose-gold" },
      { sceneId: 913, variantId: null, live: false, label: "halo-band-live" },
    ];
    const orbit = { ...SIZE, path: { orbit: { start: LIVE_VIEW } } };

    expect(videoJobRequests({ ...INPUT, mode: "multiple", targets })).toEqual([
      { kind: "turntable", scene_id: 812, variant_id: null, look: LOOK, name: "ring-abc-live-360", spec: orbit },
      { kind: "turntable", scene_id: 812, variant_id: "variant-rose", look: null, name: "ring-abc-rose-gold-360", spec: orbit },
      { kind: "turntable", scene_id: 913, variant_id: null, look: null, name: "halo-band-live-360", spec: orbit },
    ]);
  });

  it("Multiple: nothing while the picks are read", () => {
    expect(videoJobRequests({ ...INPUT, mode: "multiple", targets: null })).toEqual([]);
  });
});
