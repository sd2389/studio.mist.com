"use client";

import { useEffect, useRef } from "react";
import type { SavedPose } from "@/lib/slot-materials/model-config";
import { findPoseById, mergePoses } from "@/lib/viewer-scene";
import { applyCameraPose } from "@/stores/orbit-controls-store";

type ScenePoseBridgeProps = {
  activePoseId: string | null | undefined;
  savedPoses: SavedPose[] | undefined;
};

/** Applies the active saved pose once orbit controls are available. */
export function ScenePoseBridge({ activePoseId, savedPoses }: ScenePoseBridgeProps) {
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activePoseId || appliedRef.current === activePoseId) return;
    const poses = mergePoses(savedPoses);
    const pose = findPoseById(poses, activePoseId);
    if (!pose) return;

    const timer = window.setTimeout(() => {
      applyCameraPose({
        cameraPosition: pose.cameraPosition,
        target: pose.target,
      });
      appliedRef.current = activePoseId;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activePoseId, savedPoses]);

  return null;
}
