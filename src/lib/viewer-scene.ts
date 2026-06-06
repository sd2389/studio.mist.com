import type { ModelTransform, SavedPose, SceneAdvancedSettings } from "@/lib/slot-materials/model-config";
import { DEFAULT_MODEL_TRANSFORM } from "@/lib/slot-materials/model-config";

export const DEFAULT_POSES: SavedPose[] = [
  {
    id: "pose-top",
    name: "Top",
    cameraPosition: [0, 3.2, 0.02],
    target: [0, 0, 0],
    isDefault: true,
  },
  {
    id: "pose-right",
    name: "Right",
    cameraPosition: [2.4, 0.35, 0.02],
    target: [0, 0, 0],
    isDefault: true,
  },
  {
    id: "pose-default",
    name: "Default",
    cameraPosition: [0, 0.35, 2.2],
    target: [0, 0, 0],
    isDefault: true,
  },
  {
    id: "pose-left",
    name: "Left Angle",
    cameraPosition: [-2.4, 0.35, 0.02],
    target: [0, 0, 0],
    isDefault: true,
  },
];

export function normalizeModelTransform(
  transform: ModelTransform | null | undefined,
): ModelTransform {
  if (!transform) return { ...DEFAULT_MODEL_TRANSFORM, position: { ...DEFAULT_MODEL_TRANSFORM.position }, rotation: { ...DEFAULT_MODEL_TRANSFORM.rotation } };
  return {
    position: {
      x: Number.isFinite(transform.position?.x) ? transform.position.x : 0,
      y: Number.isFinite(transform.position?.y) ? transform.position.y : 0,
      z: Number.isFinite(transform.position?.z) ? transform.position.z : 0,
    },
    rotation: {
      x: Number.isFinite(transform.rotation?.x) ? transform.rotation.x : 0,
      y: Number.isFinite(transform.rotation?.y) ? transform.rotation.y : 0,
      z: Number.isFinite(transform.rotation?.z) ? transform.rotation.z : 0,
    },
  };
}

export function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function envRotationDegrees(
  advanced: SceneAdvancedSettings | undefined,
  envType: "metal" | "gem",
  fallback = 0,
): number {
  const key = envType === "metal" ? "metalEnvRotation" : "gemEnvRotation";
  const value = advanced?.[key];
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function envIntensityPercent(
  advanced: SceneAdvancedSettings | undefined,
  envType: "metal" | "gem",
  fallback = 100,
): number {
  const key = envType === "metal" ? "metalEnvIntensity" : "gemEnvIntensity";
  const value = advanced?.[key];
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function envIntensityMultiplier(
  advanced: SceneAdvancedSettings | undefined,
  envType: "metal" | "gem",
  catalogDefault = 1,
): number {
  const percent = envIntensityPercent(advanced, envType, catalogDefault * 100);
  return Math.max(0, percent) / 100;
}

export function mergePoses(saved: SavedPose[] | undefined): SavedPose[] {
  const custom = (saved ?? []).filter((pose) => !pose.isDefault);
  return [...DEFAULT_POSES, ...custom];
}

export function findPoseById(poses: SavedPose[], poseId: string | null | undefined): SavedPose | null {
  if (!poseId) return null;
  return poses.find((pose) => pose.id === poseId) ?? null;
}
