import type { SavedPose } from "@/lib/slot-materials/model-config";
import { findPoseById, mergePoses, VIEWER_FOV_DEG, VIEWER_START_POSITION } from "@/lib/viewer-scene";
import { BUILT_IN_ANGLES, DEFAULT_CAMPAIGN_PACK_CONFIG } from "../campaign-pack/domain/defaults";
import type { ModelBounds } from "../campaign-pack/domain/framing";
import type { Vec3 } from "../campaign-pack/domain/types";
import { stillCamera, type FramingContext, type ShotCamera } from "../campaign-pack/engine/pack-camera";
import type { AngleCamera, CameraSpec } from "./job-payload";

const ORIGIN: Vec3 = [0, 0, 0];
/** OrbitControls keep the viewer's camera upright. */
const WORLD_UP: Vec3 = [0, 1, 0];

export type CameraContext = {
  /** The look's saved poses (`scene_settings.poses`); the studio's four defaults always resolve. */
  poses: SavedPose[] | undefined;
  /** Sampled points of the visible model, to frame angles on; null when there are none. */
  bounds: ModelBounds | null;
  /** The image's width over its height. */
  aspect: number;
};

/** From `position` toward `target` through the viewer's lens: the picture the studio shows. */
function viewerShot(position: Vec3, target: Vec3): ShotCamera {
  return { position: [...position], target: [...target], up: [...WORLD_UP], fovDeg: VIEWER_FOV_DEG };
}

/**
 * How the Campaign Pack frames a shot of the model: auto-framed on its bounds with the pack's
 * lens, inside a margin (the pack's 8% unless given). With nothing visible to frame, the shot is
 * taken from the viewer's opening distance through the viewer's lens.
 */
export function packFraming(context: CameraContext, marginPct = DEFAULT_CAMPAIGN_PACK_CONFIG.marginPct): FramingContext {
  return {
    autoFrame: true,
    margin: marginPct / 100,
    bounds: context.bounds,
    orbitTarget: ORIGIN,
    livePosition: VIEWER_START_POSITION,
    liveFovDeg: VIEWER_FOV_DEG,
  };
}

/** Framed the way the Campaign Pack frames its stills. */
function angleShot(camera: AngleCamera, context: CameraContext): ShotCamera {
  const angle = BUILT_IN_ANGLES.find((built) => built.id === camera.angle);
  if (!angle) throw new Error(`Unknown camera angle "${camera.angle}".`);
  return stillCamera({ kind: "preset", ...angle, slug: angle.id }, packFraming(context, camera.margin_pct), context.aspect);
}

/** Where a job's camera stands, where it looks and through which lens. */
export function resolveShotCamera(camera: CameraSpec, context: CameraContext): ShotCamera {
  if ("view" in camera) return viewerShot(camera.view.position, camera.view.target);
  if ("pose" in camera) {
    const pose = findPoseById(mergePoses(context.poses), camera.pose);
    if (!pose) throw new Error(`The look has no saved pose "${camera.pose}".`);
    return viewerShot(pose.cameraPosition, pose.target);
  }
  return angleShot(camera, context);
}

/** An output's label: the angle or pose id. The live view has none. */
export function cameraLabel(camera: CameraSpec): string | null {
  if ("angle" in camera) return camera.angle;
  if ("pose" in camera) return camera.pose;
  return null;
}
