import * as THREE from "three";
import {
  orbitPosition,
  orbitStartFromAngles,
  orbitStartFromView,
  type OrbitStart,
} from "@/lib/camera-orbit";
import { angleDirection } from "../domain/angles";
import {
  PACK_LENS_FOV_DEG,
  PACK_ORBIT_AZIMUTH_DEG,
  PACK_ORBIT_ELEVATION_DEG,
} from "../domain/defaults";
import { cameraBasis, fitOrbitDistance, frameView, type ModelBounds } from "../domain/framing";
import type { PackAngle, Vec3 } from "../domain/types";

export type ShotCamera = { position: Vec3; target: Vec3; up: Vec3; fovDeg: number };

export type FramingContext = {
  autoFrame: boolean;
  margin: number;
  bounds: ModelBounds | null;
  /** OrbitControls target and the live camera — used when auto-framing is off. */
  orbitTarget: Vec3;
  livePosition: Vec3;
  liveFovDeg: number;
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

function liveDistance(ctx: FramingContext): number {
  const [x, y, z] = ctx.livePosition;
  const [tx, ty, tz] = ctx.orbitTarget;
  return Math.max(Math.hypot(x - tx, y - ty, z - tz), 1e-3);
}

export function stillCamera(angle: PackAngle, ctx: FramingContext, aspect: number): ShotCamera {
  const direction = angleDirection(angle);
  if (ctx.autoFrame && ctx.bounds) {
    const placement = frameView({
      points: ctx.bounds.points,
      center: ctx.bounds.center,
      direction,
      fovYDeg: PACK_LENS_FOV_DEG,
      aspect,
      margin: ctx.margin,
    });
    return { ...placement, fovDeg: PACK_LENS_FOV_DEG };
  }
  if (angle.kind === "pose") {
    return { position: angle.position, target: angle.target, up: cameraBasis(direction).up, fovDeg: ctx.liveFovDeg };
  }
  return {
    position: add(ctx.orbitTarget, scale(direction, liveDistance(ctx))),
    target: ctx.orbitTarget,
    up: cameraBasis(direction).up,
    fovDeg: ctx.liveFovDeg,
  };
}

export type OrbitShot = { start: OrbitStart; fovDeg: number };

/** Auto-framed orbits fit the subject at every azimuth; otherwise they start from the live view. */
export function orbitShot(ctx: FramingContext, aspect: number): OrbitShot {
  if (ctx.autoFrame && ctx.bounds) {
    const distance = fitOrbitDistance({
      points: ctx.bounds.points,
      target: ctx.bounds.center,
      elevationDeg: PACK_ORBIT_ELEVATION_DEG,
      fovYDeg: PACK_LENS_FOV_DEG,
      aspect,
      margin: ctx.margin,
    });
    return {
      start: orbitStartFromAngles(ctx.bounds.center, PACK_ORBIT_AZIMUTH_DEG, PACK_ORBIT_ELEVATION_DEG, distance),
      fovDeg: PACK_LENS_FOV_DEG,
    };
  }
  return { start: orbitStartFromView(ctx.livePosition, ctx.orbitTarget), fovDeg: ctx.liveFovDeg };
}

export function orbitShotCamera(shot: OrbitShot, angle: number): ShotCamera {
  return { position: orbitPosition(shot.start, angle), target: shot.start.target, up: [0, 1, 0], fovDeg: shot.fovDeg };
}

export function applyShotCamera(camera: THREE.Camera, shot: ShotCamera): void {
  if (camera instanceof THREE.PerspectiveCamera && camera.fov !== shot.fovDeg) {
    camera.fov = shot.fovDeg;
    camera.updateProjectionMatrix();
  }
  camera.position.set(...shot.position);
  camera.up.set(...shot.up);
  camera.lookAt(...shot.target);
  camera.updateMatrixWorld(true);
}
