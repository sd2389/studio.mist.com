import { describe, expect, it } from "vitest";
import type { SavedPose } from "@/lib/slot-materials/model-config";
import { VIEWER_FOV_DEG, VIEWER_START_POSITION } from "@/lib/viewer-scene";
import { PACK_LENS_FOV_DEG } from "../campaign-pack/domain/defaults";
import { boundsFromPoints, projectToNdc } from "../campaign-pack/domain/framing";
import type { Vec3 } from "../campaign-pack/domain/types";
import type { ShotCamera } from "../campaign-pack/engine/pack-camera";
import { cameraLabel, resolveShotCamera, type CameraContext } from "./cameras";

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

const HERO: SavedPose = { id: "pose-hero", name: "Hero", cameraPosition: [1.2, 0.6, 1.8], target: [0, 0.1, 0] };

function context(overrides: Partial<CameraContext> = {}): CameraContext {
  return { poses: [HERO], bounds: boundsFromPoints(ringPoints()), aspect: 1, ...overrides };
}

const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const direction = (shot: ShotCamera): Vec3 => {
  const d: Vec3 = [shot.position[0] - shot.target[0], shot.position[1] - shot.target[1], shot.position[2] - shot.target[2]];
  return [d[0] / length(d), d[1] / length(d), d[2] / length(d)];
};

/** How far each point lands from the centre of the image, in NDC: 1 is the edge. */
function extent(shot: ShotCamera, aspect: number) {
  const ndc = ringPoints().map((point) => projectToNdc({ ...shot, distance: 0 }, point, shot.fovDeg, aspect));
  return {
    x: Math.max(...ndc.map(([x]) => Math.abs(x))),
    y: Math.max(...ndc.map(([, y]) => Math.abs(y))),
  };
}

describe("resolveShotCamera", () => {
  it("draws the live view from where it stood, through the viewer's lens", () => {
    const view = { position: [0.62, 0.88, 2.25] as Vec3, target: [0, 0.05, 0] as Vec3 };
    const shot = resolveShotCamera({ view }, context());
    expect(shot).toEqual({ position: [0.62, 0.88, 2.25], target: [0, 0.05, 0], up: [0, 1, 0], fovDeg: VIEWER_FOV_DEG });
    shot.position[0] = 9;
    expect(view.position[0]).toBe(0.62);
  });

  it("finds a saved pose of the look by its id", () => {
    const shot = resolveShotCamera({ pose: "pose-hero" }, context());
    expect(shot).toEqual({ position: HERO.cameraPosition, target: HERO.target, up: [0, 1, 0], fovDeg: VIEWER_FOV_DEG });
  });

  it("finds the studio's default poses in any look", () => {
    const shot = resolveShotCamera({ pose: "pose-top" }, context({ poses: undefined }));
    expect(shot.position).toEqual([0, 3.2, 0.02]);
    expect(shot.target).toEqual([0, 0, 0]);
  });

  it("refuses a pose the look does not have", () => {
    expect(() => resolveShotCamera({ pose: "pose-gone" }, context())).toThrow(/pose-gone/);
  });

  it("frames an angle with the Campaign Pack's lens, the model filling the frame inside the margin", () => {
    const shot = resolveShotCamera({ angle: "three-quarter", margin_pct: 10 }, context());
    expect(shot.fovDeg).toBe(PACK_LENS_FOV_DEG);
    const { x, y } = extent(shot, 1);
    expect(Math.max(x, y)).toBeCloseTo(0.8, 3);
    // Three-quarter: 35° round from the front, 24° up.
    const [dx, dy, dz] = direction(shot);
    expect((Math.atan2(dx, dz) * 180) / Math.PI).toBeCloseTo(35, 1);
    expect((Math.asin(dy) * 180) / Math.PI).toBeCloseTo(24, 1);
  });

  it("leaves the Campaign Pack's 8% margin when the job gives none", () => {
    expect(resolveShotCamera({ angle: "front" }, context())).toEqual(resolveShotCamera({ angle: "front", margin_pct: 8 }, context()));
  });

  it("frames for the image's shape", () => {
    const wide = resolveShotCamera({ angle: "front", margin_pct: 0 }, context({ aspect: 16 / 9 }));
    const { x, y } = extent(wide, 16 / 9);
    expect(Math.max(x, y)).toBeCloseTo(1, 3);
    expect(x).toBeLessThanOrEqual(1 + 1e-9);
    // A tall band seen from the front fills the height of a wide frame.
    expect(y).toBeCloseTo(1, 3);
  });

  it("looks straight down for the top angle, the back of the piece at the top of the image", () => {
    const shot = resolveShotCamera({ angle: "top" }, context());
    expect(direction(shot)[1]).toBeCloseTo(1, 6);
    expect(shot.up[2]).toBeCloseTo(-1, 6);
  });

  it("sees an angle from the viewer's opening distance when there is nothing to frame", () => {
    const shot = resolveShotCamera({ angle: "side" }, context({ bounds: null }));
    expect(shot.target).toEqual([0, 0, 0]);
    expect(length(shot.position)).toBeCloseTo(length(VIEWER_START_POSITION), 6);
    expect(direction(shot)[0]).toBeGreaterThan(0.99);
    expect(shot.fovDeg).toBe(VIEWER_FOV_DEG);
  });
});

describe("cameraLabel", () => {
  it("labels an image with its angle or pose, and the live view with nothing", () => {
    expect(cameraLabel({ angle: "front" })).toBe("front");
    expect(cameraLabel({ pose: "pose-hero" })).toBe("pose-hero");
    expect(cameraLabel({ view: { position: [0, 0, 1], target: [0, 0, 0] } })).toBeNull();
  });
});
