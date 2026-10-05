import { turntableAngle } from "@/lib/camera-orbit";
import { multiAnglePath, turntablePath } from "@/lib/video-camera-path";
import { orbitShot, orbitShotCamera, type ShotCamera } from "../campaign-pack/engine/pack-camera";
import { packFraming, resolveShotCamera, type CameraContext } from "./cameras";
import type { TurntablePath } from "./job-payload";

/** Frame `index` of a turntable or a spin → its camera. */
export type FramePath = (index: number) => ShotCamera;

/** OrbitControls keep the viewer's camera upright, and the studio's video export kept it so. */
const WORLD_UP: ShotCamera["up"] = [0, 1, 0];

/**
 * A turntable's camera on each frame, moved by the studio's own video export paths: an orbit
 * from the start camera, through that camera's lens (`recordTurntable`), or a cut through the
 * poses, each held for an equal share of the frames (`recordMultiAngle`).
 */
export function turntableFramePath(path: TurntablePath, frames: number, context: CameraContext): FramePath {
  if ("poses" in path) {
    return multiAnglePath(
      path.poses.map((pose) => resolveShotCamera({ pose }, context)),
      frames,
    );
  }
  const start = resolveShotCamera(path.orbit.start, context);
  const orbit = turntablePath({ cameraPosition: start.position, target: start.target }, frames);
  return (index) => {
    const { cameraPosition, target } = orbit(index);
    return { position: cameraPosition, target: [...target], up: [...WORLD_UP], fovDeg: start.fovDeg };
  };
}

/**
 * A spin's camera on each frame, as the Campaign Pack turns its spins: one turn of the pack's
 * orbit (20° up, from 35° round, at the distance that fits the piece at every azimuth, with the
 * pack's lens and margin), frame `frames` coming back round to frame 0.
 */
export function spinFramePath(frames: number, context: CameraContext): FramePath {
  const shot = orbitShot(packFraming(context), context.aspect);
  return (index) => orbitShotCamera(shot, turntableAngle(index, frames));
}
