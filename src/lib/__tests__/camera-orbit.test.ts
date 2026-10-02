import { describe, expect, it } from "vitest";
import {
  orbitPosition,
  orbitStartFromAngles,
  orbitStartFromView,
  turntableAngle,
  type Vec3,
} from "@/lib/camera-orbit";

const close = (a: Vec3, b: Vec3) => a.forEach((value, i) => expect(value).toBeCloseTo(b[i]!, 9));

describe("orbitStartFromView", () => {
  it("starts from the current view: frame 0 is the live camera position", () => {
    const position: Vec3 = [0.62, 0.88, 2.25];
    const start = orbitStartFromView(position, [0, 0, 0]);
    close(orbitPosition(start, 0), position);
    expect(start.azimuth).toBeCloseTo(Math.atan2(0.62, 2.25), 12);
  });

  it("orbits the target with the horizontal radius and a constant height", () => {
    const target: Vec3 = [0.3, 0.1, -0.2];
    const position: Vec3 = [1.3, 1.1, 0.8];
    const start = orbitStartFromView(position, target);
    expect(start.radius).toBeCloseTo(Math.hypot(1, 1), 12);
    for (const angle of [0.5, 1.7, Math.PI, 5]) {
      const p = orbitPosition(start, angle);
      expect(Math.hypot(p[0] - target[0], p[2] - target[2])).toBeCloseTo(start.radius, 12);
      expect(p[1]).toBeCloseTo(position[1], 12);
    }
  });

  it("does not zoom out: 3D distance to the target is preserved", () => {
    const target: Vec3 = [0, 0, 0];
    const position: Vec3 = [0, 1.9, 3.8];
    const start = orbitStartFromView(position, target);
    const quarter = orbitPosition(start, Math.PI / 2);
    expect(Math.hypot(...quarter)).toBeCloseTo(Math.hypot(...position), 12);
  });

  it("keeps a sliver of radius for straight-down views", () => {
    const start = orbitStartFromView([0, 3, 0], [0, 0, 0]);
    expect(start.radius).toBeGreaterThan(0);
    expect(orbitPosition(start, 1).every(Number.isFinite)).toBe(true);
  });
});

describe("turntableAngle", () => {
  it("loops seamlessly (frame N would equal frame 0)", () => {
    expect(turntableAngle(0, 72)).toBe(0);
    expect(turntableAngle(72, 72)).toBeCloseTo(Math.PI * 2, 12);
    expect(turntableAngle(18, 72)).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe("orbitStartFromAngles", () => {
  it("places the camera at the requested distance and elevation", () => {
    const start = orbitStartFromAngles([0, 0, 0], 90, 30, 2);
    const p = orbitPosition(start, 0);
    expect(Math.hypot(...p)).toBeCloseTo(2, 9);
    expect(p[0]).toBeCloseTo(2 * Math.cos(Math.PI / 6), 9);
    expect(p[1]).toBeCloseTo(1, 9);
  });
});
