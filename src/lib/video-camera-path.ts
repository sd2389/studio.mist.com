import { orbitPosition, orbitStartFromView, turntableAngle, type Vec3 } from "@/lib/camera-orbit";

/**
 * Where a video's camera goes, frame by frame. The studio's video export (`video-capture.ts`)
 * and the render worker's harness (ADR 0005) both move their camera with these, so a video
 * rendered on the server moves exactly as one recorded in the browser did.
 */

export type CameraPose = {
  cameraPosition: Vec3;
  target: Vec3;
};

/** Frame `index` → where the camera stands and what it looks at. */
export type CameraPath = (index: number) => CameraPose;

/**
 * 360° orbit that starts from a view: same azimuth, same height and the same horizontal radius
 * around the view's target, so frame 0 is the view itself and the loop is seamless.
 */
export function turntablePath(view: CameraPose, frameCount: number): CameraPath {
  const start = orbitStartFromView(view.cameraPosition, view.target);
  return (index) => ({
    cameraPosition: orbitPosition(start, turntableAngle(index, frameCount)),
    target: view.target,
  });
}

/** Cuts through the poses in order, holding each for an equal share of the frames; the last keeps the rest. */
export function multiAnglePath<Pose>(poses: readonly Pose[], frameCount: number): (index: number) => Pose {
  if (poses.length === 0) throw new Error("At least one pose is required");
  const framesPerPose = Math.max(1, Math.floor(frameCount / poses.length));
  return (index) => poses[Math.min(Math.floor(index / framesPerPose), poses.length - 1)]!;
}
