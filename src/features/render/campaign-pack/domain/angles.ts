import { BUILT_IN_ANGLES } from "./defaults";
import { slugify, uniqueSlug } from "./naming";
import type { PackAngle, SavedPoseLike, Vec3 } from "./types";

export const POSE_ANGLE_PREFIX = "pose:";

export function poseAngleId(poseId: string): string {
  return `${POSE_ANGLE_PREFIX}${poseId}`;
}

/** Saved poses the user created (the four studio defaults are covered by built-ins). */
export function customPoses(poses: SavedPoseLike[] | undefined): SavedPoseLike[] {
  return (poses ?? []).filter((pose) => !pose.isDefault);
}

/** Resolves selected angle ids in a stable order: built-ins first, then saved poses. */
export function resolvePackAngles(angleIds: string[], savedPoses: SavedPoseLike[]): PackAngle[] {
  const selected = new Set(angleIds);
  const taken = new Set<string>();
  const angles: PackAngle[] = [];
  for (const angle of BUILT_IN_ANGLES) {
    if (!selected.has(angle.id)) continue;
    angles.push({ kind: "preset", ...angle, slug: uniqueSlug(angle.id, taken) });
  }
  for (const pose of customPoses(savedPoses)) {
    if (!selected.has(poseAngleId(pose.id))) continue;
    angles.push({
      kind: "pose",
      id: pose.id,
      label: pose.name,
      slug: uniqueSlug(`pose-${slugify(pose.name) || "saved"}`, taken),
      position: [...pose.cameraPosition],
      target: [...pose.target],
    });
  }
  return angles;
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-9 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 1];
}

/** Unit vector from the subject toward the camera. Azimuth runs from +Z toward +X. */
export function directionFromAngles(azimuthDeg: number, elevationDeg: number): Vec3 {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  return normalize([
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ]);
}

/** Looking down from above ~60°: a projected ground shadow only reads as a cropped smudge. */
export function isOverheadAngle(angle: PackAngle): boolean {
  return angleDirection(angle)[1] >= Math.sin((60 * Math.PI) / 180);
}

export function angleDirection(angle: PackAngle): Vec3 {
  if (angle.kind === "preset") return directionFromAngles(angle.azimuthDeg, angle.elevationDeg);
  return normalize([
    angle.position[0] - angle.target[0],
    angle.position[1] - angle.target[1],
    angle.position[2] - angle.target[2],
  ]);
}
