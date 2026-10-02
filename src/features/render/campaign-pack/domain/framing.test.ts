import { describe, expect, it } from "vitest";
import { directionFromAngles } from "./angles";
import { boundsFromPoints, cameraBasis, fitOrbitDistance, frameView, projectToNdc } from "./framing";
import type { Vec3 } from "./types";

function cubePoints(center: Vec3 = [0, 0, 0], half: Vec3 = [0.5, 0.5, 0.5]): Vec3[] {
  const points: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    points.push([center[0] + sx * half[0], center[1] + sy * half[1], center[2] + sz * half[2]]);
  }
  return points;
}

/** A ring-like torus sample (band in the XY plane) — asymmetric silhouettes per view. */
function ringPoints(): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 12; j++) {
      const u = (i / 64) * Math.PI * 2;
      const v = (j / 12) * Math.PI * 2;
      const r = 0.6 + 0.08 * Math.cos(v);
      points.push([r * Math.cos(u), r * Math.sin(u) + 0.1, 0.12 * Math.sin(v)]);
    }
  }
  points.push([0, 0.95, 0], [0.15, 0.85, 0.1]); // the "head"
  return points;
}

function projectedExtent(points: Vec3[], placement: ReturnType<typeof frameView>, fov: number, aspect: number) {
  const ndc = points.map((p) => projectToNdc(placement, p, fov, aspect));
  const xs = ndc.map((p) => p[0]);
  const ys = ndc.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("frameView", () => {
  const fov = 30;
  const margin = 0.08;
  const limit = 1 - 2 * margin;

  it("fits a cube inside the margin, tight on the limiting axis and centred", () => {
    const points = cubePoints();
    const placement = frameView({ points, center: [0, 0, 0], direction: [0, 0, 1], fovYDeg: fov, aspect: 1, margin });
    const e = projectedExtent(points, placement, fov, 1);
    expect(Math.max(-e.minX, e.maxX, -e.minY, e.maxY)).toBeCloseTo(limit, 5);
    expect(Math.abs(e.minX + e.maxX)).toBeLessThan(1e-5);
    expect(Math.abs(e.minY + e.maxY)).toBeLessThan(1e-5);
  });

  it("recentres an off-centre subject from any start aim", () => {
    const points = ringPoints().map(([x, y, z]) => [x + 3, y - 2, z + 1] as Vec3);
    const placement = frameView({
      points,
      center: [0, 0, 0],
      direction: directionFromAngles(35, 24),
      fovYDeg: fov,
      aspect: 1,
      margin,
    });
    const e = projectedExtent(points, placement, fov, 1);
    expect(Math.abs(e.minX + e.maxX)).toBeLessThan(1e-4);
    expect(Math.abs(e.minY + e.maxY)).toBeLessThan(1e-4);
    expect(Math.max(-e.minX, e.maxX, -e.minY, e.maxY)).toBeLessThanOrEqual(limit + 1e-6);
    expect(Math.max(-e.minX, e.maxX, -e.minY, e.maxY)).toBeGreaterThan(limit - 0.01);
  });

  it("respects the horizontal limit on a wide frame", () => {
    const points = cubePoints([0, 0, 0], [2, 0.2, 0.2]);
    const aspect = 16 / 9;
    const placement = frameView({ points, center: [0, 0, 0], direction: [0, 0, 1], fovYDeg: fov, aspect, margin });
    const e = projectedExtent(points, placement, fov, aspect);
    expect(e.maxX).toBeCloseTo(limit, 5);
    expect(e.maxY).toBeLessThan(limit);
  });

  it("handles a straight-down top view without NaNs, screen-up toward -Z", () => {
    const points = ringPoints();
    const placement = frameView({ points, center: [0, 0, 0], direction: [0, 1, 0], fovYDeg: fov, aspect: 1, margin });
    expect(placement.position.every(Number.isFinite)).toBe(true);
    expect(placement.up[2]).toBeCloseTo(-1, 6);
    expect(placement.position[1]).toBeGreaterThan(placement.target[1]);
    const e = projectedExtent(points, placement, fov, 1);
    expect(Math.max(-e.minX, e.maxX, -e.minY, e.maxY)).toBeCloseTo(limit, 3);
  });

  it("gets farther as the margin grows", () => {
    const points = ringPoints();
    const near = frameView({ points, center: [0, 0, 0], direction: [0, 0, 1], fovYDeg: fov, aspect: 1, margin: 0 });
    const far = frameView({ points, center: [0, 0, 0], direction: [0, 0, 1], fovYDeg: fov, aspect: 1, margin: 0.2 });
    expect(far.distance).toBeGreaterThan(near.distance);
  });
});

describe("fitOrbitDistance", () => {
  it("keeps the subject inside the margins at every azimuth", () => {
    const points = ringPoints();
    const target: Vec3 = boundsFromPoints(points)!.center;
    const margin = 0.08;
    const distance = fitOrbitDistance({ points, target, elevationDeg: 20, fovYDeg: 30, aspect: 1, margin });
    for (let deg = 0; deg < 360; deg += 7) {
      const direction = directionFromAngles(deg, 20);
      const position: Vec3 = [target[0] + direction[0] * distance, target[1] + direction[1] * distance, target[2] + direction[2] * distance];
      const placement = { position, target, up: cameraBasis(direction).up, distance };
      const e = projectedExtent(points, placement, 30, 1);
      expect(Math.max(-e.minX, e.maxX, -e.minY, e.maxY)).toBeLessThanOrEqual(1 - 2 * margin + 1e-3);
    }
  });
});

describe("boundsFromPoints", () => {
  it("returns the box centre and half-diagonal", () => {
    const bounds = boundsFromPoints(cubePoints([1, 2, 3]))!;
    expect(bounds.center).toEqual([1, 2, 3]);
    expect(bounds.radius).toBeCloseTo(Math.sqrt(3) / 2, 6);
    expect(boundsFromPoints([])).toBeNull();
  });
});
