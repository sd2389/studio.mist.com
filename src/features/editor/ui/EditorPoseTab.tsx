"use client";

import { Eye, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SavedPose } from "@/lib/slot-materials/model-config";
import { DEFAULT_POSES, mergePoses } from "@/lib/viewer-scene";
import {
  applyCameraPose,
  captureCurrentCameraPose,
} from "@/stores/orbit-controls-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

function createPoseId(): string {
  return `pose-${Date.now().toString(36)}`;
}

export function EditorPoseTab() {
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setPoses = useMaterialPresetStore((s) => s.setPoses);
  const setActivePoseId = useMaterialPresetStore((s) => s.setActivePoseId);

  const [poseName, setPoseName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const poses = useMemo(() => mergePoses(sceneSettings.poses), [sceneSettings.poses]);
  const customPoses = poses.filter((pose) => !pose.isDefault);
  const activePoseId = sceneSettings.activePoseId;

  const applyPose = (pose: SavedPose) => {
    applyCameraPose({
      cameraPosition: pose.cameraPosition,
      target: pose.target,
    });
    setActivePoseId(pose.id);
  };

  const handleAddPose = () => {
    setError(null);
    const trimmed = poseName.trim();
    if (!trimmed) {
      setError("Enter a pose name first.");
      return;
    }
    const captured = captureCurrentCameraPose();
    if (!captured) {
      setError("Viewport is not ready yet.");
      return;
    }
    const nextPose: SavedPose = {
      id: createPoseId(),
      name: trimmed,
      cameraPosition: captured.cameraPosition,
      target: captured.target,
    };
    setPoses([...customPoses, nextPose]);
    setActivePoseId(nextPose.id);
    setPoseName("");
  };

  const handleDeletePose = (poseId: string) => {
    const nextCustom = customPoses.filter((pose) => pose.id !== poseId);
    setPoses(nextCustom);
    if (activePoseId === poseId) {
      setActivePoseId(DEFAULT_POSES[2]?.id ?? null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Pose</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Default camera angles plus custom named poses for multi-angle exports.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Default poses
            </p>
            <div className="space-y-1.5">
              {DEFAULT_POSES.map((pose) => (
                <PoseRow
                  key={pose.id}
                  pose={pose}
                  active={activePoseId === pose.id}
                  onApply={() => applyPose(pose)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Custom poses
            </p>
            {customPoses.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                No custom poses yet. Frame the viewport, name the pose, and add it.
              </p>
            ) : (
              <div className="space-y-1.5">
                {customPoses.map((pose) => (
                  <PoseRow
                    key={pose.id}
                    pose={pose}
                    active={activePoseId === pose.id}
                    onApply={() => applyPose(pose)}
                    onDelete={() => handleDeletePose(pose.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Save current view
            </p>
            <Input
              value={poseName}
              onChange={(event) => setPoseName(event.target.value)}
              placeholder="Enter pose name"
              className="h-9 text-xs"
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={handleAddPose}
            >
              <Plus className="size-3.5" aria-hidden />
              Add pose
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PoseRow({
  pose,
  active,
  onApply,
  onDelete,
}: {
  pose: SavedPose;
  active: boolean;
  onApply: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
        active ? "border-foreground/35 bg-card" : "border-border/60 bg-muted/20"
      }`}
    >
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{pose.name}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onApply}
        aria-label={`Apply ${pose.name}`}
        title="Apply pose"
      >
        <Eye className="size-3.5" aria-hidden />
      </Button>
      {onDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete ${pose.name}`}
          title="Delete pose"
        >
          <Trash2 className="size-3.5 text-destructive" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
